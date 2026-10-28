using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;

// The helper prepares local files. Browser consent is completed in Edge/Chrome, never bypassed.
internal class InstallPlan { public string version {get;set;} public string payloadSha256 {get;set;} public Dictionary<string,string> files {get;set;} }
internal class InstallResult {
    public bool success; public string version; public string folder; public string extensionId;
    public string browser; public string browserPath; public string dashboardUrl; public int files;
    public bool manualConfirmationRequired = true; public bool shortcutCreated; public string warning; public string error;
}
internal class DetectedInstall { public string id; public string profile; public string folder; public string version; public bool enabled; }
internal static class Setup {
    internal static readonly JavaScriptSerializer Json = CreateJson();
    static JavaScriptSerializer CreateJson(){var serializer=new JavaScriptSerializer();serializer.MaxJsonLength=int.MaxValue;return serializer;}
    internal static readonly string DefaultRoot = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Xiaoshijian");
    internal static readonly InstallPlan Plan = Json.Deserialize<InstallPlan>(Encoding.UTF8.GetString(Resource("InstallPlan.json")));
    [STAThread]
    public static int Main(string[] args) {
        string resultFile = Value(args, "--result");
        try {
            string preview=Value(args,"--preview");
            if(preview!=null) {Application.EnableVisualStyles();using(var form=new SetupWindow()){form.ShowInTaskbar=false;form.StartPosition=FormStartPosition.Manual;form.Location=new Point(-20000,-20000);form.Show();Application.DoEvents();using(var bitmap=new Bitmap(form.Width,form.Height)){form.DrawToBitmap(bitmap,new Rectangle(Point.Empty,form.Size));bitmap.Save(preview,System.Drawing.Imaging.ImageFormat.Png);}form.Close();}return 0;}
            if(args.Contains("--ui-manage-test")) {
                string profile=Value(args,"--browser-profile");
                if(String.IsNullOrEmpty(profile)||String.IsNullOrEmpty(resultFile))throw new Exception("管理页按钮测试必须指定 browser-profile 和 result。");
                Application.EnableVisualStyles();bool opened=false;
                using(var form=new SetupWindow(null,null,true,profile)) {
                    form.StartPosition=FormStartPosition.Manual;form.Location=new Point(-20000,-20000);form.ShowInTaskbar=false;
                    form.Shown+=delegate {form.ChooseBrowser(Value(args,"--browser")??"edge");opened=form.TestManagementButton(resultFile);form.BeginInvoke(new Action(()=>form.Close()));};Application.Run(form);
                }
                return opened?0:1;
            }
            if (args.Contains("--install-only")) {
                string root = Value(args, "--root"); string shortcuts = Value(args, "--shortcuts-dir");
                if (String.IsNullOrEmpty(root) || String.IsNullOrEmpty(shortcuts) || String.IsNullOrEmpty(resultFile)) throw new Exception("测试/命令行安装必须指定 --root、--shortcuts-dir 和 --result。");
                var result = System.Threading.Tasks.Task.Run(()=>Install(root, shortcuts, Value(args, "--browser") ?? "edge", delegate(string s) {})).GetAwaiter().GetResult();
                File.WriteAllText(resultFile, Json.Serialize(result), new UTF8Encoding(false)); return 0;
            }
            if(args.Contains("--ui-detect-test")) {
                if(String.IsNullOrEmpty(resultFile))throw new Exception("检测测试必须指定 --result。");
                string kind=Value(args,"--browser")??"edge";if(kind!="edge"&&kind!="chrome")kind="edge";
                string root=Value(args,"--root"),userData=Value(args,"--browser-profile");
                string expectedFolder=String.IsNullOrEmpty(root)?null:Path.Combine(Path.GetFullPath(root),"Extension");
                var found=DetectLoaded(kind,expectedFolder,userData);
                File.WriteAllText(resultFile,Json.Serialize(new {found=found!=null,enabled=found!=null&&found.enabled,id=found==null?null:found.id,folder=found==null?null:found.folder,profile=found==null?null:Path.GetFileName(found.profile),version=found==null?null:found.version}),new UTF8Encoding(false));
                return 0;
            }
            if(args.Contains("--ui-install-only")) {
                string root=Value(args,"--root"),shortcuts=Value(args,"--shortcuts-dir");
                if(String.IsNullOrEmpty(root)||String.IsNullOrEmpty(shortcuts)||String.IsNullOrEmpty(resultFile))throw new Exception("界面测试必须指定 root、shortcuts-dir 和 result。");
                bool open=args.Contains("--test-open-browser");string profile=Value(args,"--browser-profile");
                if(open&&String.IsNullOrEmpty(profile))throw new Exception("打开浏览器的界面测试必须指定独立 browser-profile。");
                Application.EnableVisualStyles();bool success=false;
                using(var form=new SetupWindow(root,shortcuts,!open,profile)) {
                    form.StartPosition=FormStartPosition.Manual;form.Location=new Point(-20000,-20000);form.ShowInTaskbar=false;
                    form.Completed+=result=>{success=result.success;File.WriteAllText(resultFile,Json.Serialize(result),new UTF8Encoding(false));form.BeginInvoke(new Action(()=>form.Close()));};
                    form.Shown+=delegate {form.ChooseBrowser(Value(args,"--browser")??"edge");form.StartPreparation();};Application.Run(form);
                }
                return success?0:1;
            }
            Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false); Application.Run(new SetupWindow()); return 0;
        } catch (Exception error) {
            if (!String.IsNullOrEmpty(resultFile)) File.WriteAllText(resultFile, Json.Serialize(new InstallResult {success=false,error=error.Message}),new UTF8Encoding(false));
            else MessageBox.Show("准备安装时遇到问题：\n" + error.Message, "校事笺安装助手", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }
    static string Value(string[] args, string key) { int i=Array.IndexOf(args,key);return i>=0&&i+1<args.Length?args[i+1]:null; }
    static byte[] Resource(string name) { using(var input=Assembly.GetExecutingAssembly().GetManifestResourceStream(name)) {if(input==null)throw new Exception("安装包缺少 " + name);using(var buffer=new MemoryStream()){input.CopyTo(buffer);return buffer.ToArray();}} }
    static string Hash(byte[] bytes) { using(var sha=SHA256.Create())return String.Concat(sha.ComputeHash(bytes).Select(x=>x.ToString("x2"))); }
    internal static string ExtensionId(string folder) {
        string normalized=Path.GetFullPath(folder).TrimEnd(Path.DirectorySeparatorChar);
        if(normalized.Length>1&&normalized[1]==':')normalized=Char.ToUpperInvariant(normalized[0])+normalized.Substring(1);
        return String.Concat(Hash(Encoding.Unicode.GetBytes(normalized)).Substring(0,32).Select(x=>(char)('a'+Convert.ToInt32(x.ToString(),16))));
    }
    internal static string FindBrowser(string kind) {
        string vendor=kind=="edge"?@"Microsoft\Edge\Application\msedge.exe":@"Google\Chrome\Application\chrome.exe";
        foreach(string location in new[]{Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)}) {
            string path=Path.Combine(location,vendor);if(File.Exists(path))return path;
        }
        return null;
    }
    static void CheckBrowser(string browserPath) {
        if(browserPath==null)throw new Exception("没有找到所选浏览器，请先安装或改选 Microsoft Edge / Google Chrome。");
        int major; if(!Int32.TryParse(FileVersionInfo.GetVersionInfo(browserPath).ProductVersion.Split('.')[0],out major)||major<154)throw new Exception("所选浏览器版本过旧，请先更新浏览器。本版要求 Chromium 154 或更新版本。");
    }
    // Detect a previously loaded unpacked 校事笺 extension by reading the browser profile's
    // Preferences / Secure Preferences (extensions.settings). Only reads files; never writes.
    internal static DetectedInstall DetectLoaded(string kind,string expectedFolder,string userDataOverride) {
        string userData=userDataOverride??(kind=="edge"
            ?Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),@"Microsoft\Edge\User Data")
            :Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),@"Google\Chrome\User Data"));
        if(String.IsNullOrEmpty(userData)||!Directory.Exists(userData))return null;
        string expectedId=String.IsNullOrEmpty(expectedFolder)?null:ExtensionId(expectedFolder);
        string expectedPath=null;try{if(!String.IsNullOrEmpty(expectedFolder))expectedPath=Path.GetFullPath(expectedFolder);}catch{}
        var profiles=Directory.GetDirectories(userData).Where(d=>{string n=Path.GetFileName(d);return n=="Default"||n.StartsWith("Profile ",StringComparison.Ordinal);}).OrderBy(d=>d=="Default"?0:1).ThenBy(d=>d,StringComparer.Ordinal);
        DetectedInstall byName=null;
        foreach(string profile in profiles) {
            foreach(string fileName in new[]{"Preferences","Secure Preferences"}) {
                string file=Path.Combine(profile,fileName);if(!File.Exists(file))continue;
                Dictionary<string,object> root;try{root=Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(file));}catch{continue;}
                var extensions=root!=null&&root.ContainsKey("extensions")?root["extensions"] as Dictionary<string,object>:null;
                var settings=extensions!=null&&extensions.ContainsKey("settings")?extensions["settings"] as Dictionary<string,object>:null;
                if(settings==null)continue;
                foreach(var pair in settings) {
                    var entry=pair.Value as Dictionary<string,object>;if(entry==null)continue;
                    object stored;if(!entry.TryGetValue("path",out stored))continue;string extensionPath=stored as string;
                    if(String.IsNullOrEmpty(extensionPath)||!Path.IsPathRooted(extensionPath))continue;   // packed/store entries use relative paths
                    if(!Directory.Exists(extensionPath))continue;
                    bool exact=(!String.IsNullOrEmpty(expectedId)&&String.Equals(pair.Key,expectedId,StringComparison.OrdinalIgnoreCase))
                        ||(expectedPath!=null&&String.Equals(NormalizeDir(extensionPath),NormalizeDir(expectedPath),StringComparison.OrdinalIgnoreCase));
                    string manifestName=null,manifestVersion=null;
                    try{var manifest=Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(extensionPath,"manifest.json")));if(manifest!=null){manifestName=manifest["name"] as string;manifestVersion=manifest["version"] as string;}}catch{}
                    if(!exact&&manifestName!="校事笺")continue;
                    bool enabled=true;
                    object state;if(entry.TryGetValue("state",out state)){try{enabled=Convert.ToInt64(state)==1;}catch{}}
                    object reasons;if(enabled&&entry.TryGetValue("disable_reasons",out reasons)) {try{enabled=Convert.ToInt64(reasons)==0;}catch{}}   // newer Chromium: bitfield, absent/0 = enabled
                    var found=new DetectedInstall{id=pair.Key,profile=profile,folder=extensionPath,version=manifestVersion,enabled=enabled};
                    if(exact)return found;
                    if(byName==null)byName=found;
                }
            }
        }
        return byName;
    }
    internal static string NormalizeDir(string folder){try{return Path.GetFullPath(folder).TrimEnd(Path.DirectorySeparatorChar).ToLowerInvariant();}catch{return folder;}}
    static string OwnedRoot(string root) {
        if(String.IsNullOrWhiteSpace(root)||!Path.IsPathRooted(root)||Path.GetPathRoot(root).Length<3)throw new Exception("请输入完整的安装路径，例如 D:\\应用\\校事笺。");
        string full=Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar);
        if(String.Equals(full,Path.GetPathRoot(full).TrimEnd(Path.DirectorySeparatorChar),StringComparison.OrdinalIgnoreCase))throw new Exception("请选择专用文件夹，不能直接安装到磁盘或共享根目录。");
        for(var current=new DirectoryInfo(full);current!=null;current=current.Parent)if(current.Exists&&(current.Attributes&FileAttributes.ReparsePoint)!=0)throw new Exception("安装目录不能经过符号链接或目录联接。");
        if(Directory.Exists(full)&&Directory.EnumerateFileSystemEntries(full).Any()) {
            string receipt=Path.Combine(full,"install-receipt.json");InstallResult existing=null;
            try {if(File.Exists(receipt))existing=Json.Deserialize<InstallResult>(File.ReadAllText(receipt));}catch {}
            if(existing==null||!existing.success||!String.Equals(existing.folder,Path.Combine(full,"Extension"),StringComparison.OrdinalIgnoreCase)||existing.extensionId!=ExtensionId(Path.Combine(full,"Extension")))throw new Exception("此目录已有其他文件，已保留。请选择空文件夹、新建专用文件夹，或选择原安装目录更新。");
        }
        return full;
    }
    static void RemoveStaging(string folder,string root) {
        string full=Path.GetFullPath(folder);string expected=Path.GetFullPath(root)+Path.DirectorySeparatorChar;
        if(!full.StartsWith(expected,StringComparison.OrdinalIgnoreCase)||!Path.GetFileName(full).StartsWith(".staging-",StringComparison.Ordinal))throw new Exception("拒绝清理非本项目临时目录。");
        if(Directory.Exists(full))Directory.Delete(full,true);
    }
    internal static InstallResult Install(string root,string shortcuts,string kind,Action<string> progress) {
        if(kind!="edge"&&kind!="chrome")throw new Exception("只支持 edge / chrome。");
        root=OwnedRoot(root);string browserPath=FindBrowser(kind);CheckBrowser(browserPath);
        string target=Path.Combine(root,"Extension");
        if(Directory.Exists(target)&&(File.GetAttributes(target)&FileAttributes.ReparsePoint)!=0)throw new Exception("扩展目录是目录联接，拒绝覆盖。");
        string marker=Path.Combine(root,"install-receipt.json");
        if(Directory.Exists(target)&&!File.Exists(marker))throw new Exception("安装目录含有未经本助手管理的文件，已保留。请使用其他目录或手动安装。");
        byte[] payload=Resource("Extension.zip");if(Hash(payload)!=Plan.payloadSha256)throw new Exception("安装包校验失败，请重新获取安装包。");
        Directory.CreateDirectory(root);string staging=Path.Combine(root,".staging-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(staging);
        string previous=null;bool published=false;
        try {
            progress("正在解包并校验离线 OCR 与附件读取资源…");
            var seen=new HashSet<string>(StringComparer.OrdinalIgnoreCase);long total=0;
            using(var stream=new MemoryStream(payload))using(var zip=new ZipArchive(stream,ZipArchiveMode.Read)) {
                foreach(var entry in zip.Entries) {
                    string name=entry.FullName.Replace('/',Path.DirectorySeparatorChar);
                    string destination=Path.GetFullPath(Path.Combine(staging,name));
                    if(!destination.StartsWith(staging+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)||name.Contains(':')||name.Split(Path.DirectorySeparatorChar).Contains(".."))throw new Exception("安装包路径不合法。");
                    string checksum;if(!Plan.files.TryGetValue(entry.FullName,out checksum)||!seen.Add(entry.FullName))throw new Exception("安装包包含未声明或重复的文件。");
                    total+=entry.Length;if(total>220L*1024*1024||entry.Length>100L*1024*1024)throw new Exception("安装包展开大小超限。");
                    Directory.CreateDirectory(Path.GetDirectoryName(destination));
                    using(var input=entry.Open())using(var output=File.Create(destination))input.CopyTo(output);
                    if(Hash(File.ReadAllBytes(destination))!=checksum)throw new Exception("文件校验失败："+entry.FullName);
                }
            }
            if(seen.Count!=Plan.files.Count||!File.Exists(Path.Combine(staging,"manifest.json")))throw new Exception("安装文件不完整。");
            progress("正在放置文件并创建工作台入口…");
            if(Directory.Exists(target)) {previous=Path.Combine(root,".previous-"+DateTime.Now.ToString("yyyyMMddHHmmss")+"-"+Guid.NewGuid().ToString("N").Substring(0,6));Directory.Move(target,previous);}
            Directory.Move(staging,target);published=true;
            string extensionId=ExtensionId(target),url="chrome-extension://"+extensionId+"/dashboard.html";
            File.WriteAllText(Path.Combine(root,"安装路径.txt"),target,new UTF8Encoding(false));
            File.WriteAllBytes(Path.Combine(root,"App.ico"),Resource("App.ico"));
            var result=new InstallResult {success=true,version=Plan.version,folder=target,extensionId=extensionId,browser=kind,browserPath=browserPath,dashboardUrl=url,files=seen.Count};
            try{Directory.CreateDirectory(shortcuts);CreateShortcut(Path.Combine(shortcuts,"校事笺.lnk"),browserPath,url,root);result.shortcutCreated=true;}
            catch(Exception error){result.warning="文件已准备好，但桌面入口未创建："+error.Message;}
            File.WriteAllText(marker,Json.Serialize(result),new UTF8Encoding(false));
            File.WriteAllText(Path.Combine(root,"安装说明.txt"),"文件准备完成，还需要浏览器首次确认：\r\n1. 助手会自动打开扩展管理页（"+(kind=="edge"?"edge":"chrome")+"://extensions）。若没有自动跳转，请在浏览器地址栏按 Ctrl+V、回车。\r\n2. 开启开发人员模式，点击加载解压缩的扩展，在文件夹窗口按 Ctrl+V 粘贴并确认以下目录：\r\n"+target+"\r\n\r\n加载完成校事笺会自动打开工作台，默认配置已就绪。后续可用桌面校事笺入口打开。更新前请导出完整备份。旧文件备份位于 .previous-* 目录，不包含浏览器数据库。",new UTF8Encoding(false));
            progress("文件和入口已准备好，请完成浏览器首次加载确认。");return result;
        } catch {
            // Leave the previous directory and user data recoverable if an update cannot finish.
            if(previous!=null&&!Directory.Exists(target))Directory.Move(previous,target);
            if(!published)RemoveStaging(staging,root);throw;
        }
    }
    static void CreateShortcut(string path,string browser,string url,string root) {
        Type type=Type.GetTypeFromProgID("WScript.Shell");dynamic shell=Activator.CreateInstance(type);dynamic link=shell.CreateShortcut(path);
        link.TargetPath=browser;link.Arguments="\""+url+"\"";link.WorkingDirectory=root;link.Description="打开校事笺本地工作台";link.IconLocation=Path.Combine(root,"App.ico");link.Save();
        System.Runtime.InteropServices.Marshal.FinalReleaseComObject(link);System.Runtime.InteropServices.Marshal.FinalReleaseComObject(shell);
    }
    internal static void Launch(string browser,string argument,string testProfile=null,string extra=null) {
        if(String.IsNullOrEmpty(browser))throw new Exception("没有找到所选浏览器，请安装浏览器或切换选择。");
        string arguments=(String.IsNullOrEmpty(extra)?"":extra+" ")+"\""+argument+"\"";
        if(testProfile!=null)arguments="--user-data-dir=\""+Path.GetFullPath(testProfile)+"\" "+arguments;
        Process.Start(new ProcessStartInfo(browser,arguments){UseShellExecute=true});
    }
}

internal class SetupWindow:Form {
    readonly ComboBox browser=new ComboBox();readonly Button install=new Button(),browse=new Button(),copy=new Button(),manage=new Button(),workbench=new Button(),urlCopy=new Button();readonly TextBox folder=new TextBox(),managementAddress=new TextBox(),loadPath=new TextBox();readonly Label status=new Label(),detectLabel=new Label();readonly string shortcutsOverride,testProfile;readonly bool noOpen;InstallResult installed,detectedResult;DetectedInstall detected;bool preparing,applyingResult,managementOpened;readonly Timer detectDebounce=new Timer();
    internal event Action<InstallResult> Completed;
    public SetupWindow(string initialRoot=null,string shortcutsDir=null,bool skipBrowserLaunch=false,string browserTestProfile=null) {
        shortcutsOverride=shortcutsDir;noOpen=skipBrowserLaunch;testProfile=browserTestProfile;
        Text="校事笺 · 便捷安装助手 "+Setup.Plan.version;Size=new Size(700,720);MinimumSize=Size;MaximumSize=Size;StartPosition=FormStartPosition.CenterScreen;Font=new Font("Microsoft YaHei UI",10);BackColor=Color.FromArgb(246,248,242);AutoScaleMode=AutoScaleMode.Dpi;MaximizeBox=false;
        var title=new Label {Text="收好通知，安装也轻一点",Font=new Font(Font.FontFamily,21,FontStyle.Bold),ForeColor=Color.FromArgb(23,111,98),Location=new Point(30,26),AutoSize=true};Controls.Add(title);
        AddLabel("已装过的自动识别 · 自动放置资源 · 创建桌面入口",30,82,630,30);
        AddLabel("本助手准备本地文件。首次仍需在浏览器中开启开发人员模式并确认加载。",30,121,630,42);
        browser.SetBounds(30,174,260,36);browser.DropDownStyle=ComboBoxStyle.DropDownList;browser.Items.AddRange(new object[]{"Microsoft Edge（推荐）","Google Chrome"});browser.SelectedIndex=Setup.FindBrowser("edge")!=null?0:1;Controls.Add(browser);
        install.Text="准备安装并打开浏览器";install.SetBounds(315,169,330,43);install.BackColor=Color.FromArgb(23,111,98);install.ForeColor=Color.White;install.FlatStyle=FlatStyle.Flat;install.Click+=InstallClick;Controls.Add(install);
        AddLabel("安装位置（可直接修改，也可点击浏览选择）",30,230,615,24);
        folder.SetBounds(30,258,500,28);folder.ReadOnly=false;folder.Text=initialRoot??Setup.DefaultRoot;Controls.Add(folder);
        browse.Text="浏览…";browse.SetBounds(545,254,100,35);browse.Click+=BrowseClick;Controls.Add(browse);
        loadPath.SetBounds(30,299,615,28);loadPath.ReadOnly=true;loadPath.BorderStyle=BorderStyle.None;loadPath.BackColor=BackColor;loadPath.ForeColor=Color.FromArgb(87,112,84);Controls.Add(loadPath);
        folder.TextChanged+=delegate {UpdateLoadPath();if(!preparing&&!applyingResult){installed=null;copy.Enabled=workbench.Enabled=false;install.Enabled=true;install.Text="准备安装并打开浏览器";}ScheduleDetection();};UpdateLoadPath();
        copy.Text="复制扩展路径";copy.SetBounds(30,353,170,36);copy.Enabled=false;copy.Click+=delegate {var target=installed??detectedResult;if(target==null||String.IsNullOrEmpty(target.folder)){status.Text="请先准备安装，或确认扩展目录存在。";return;}try{Clipboard.SetText(target.folder);status.Text="扩展路径已复制（这是你主动复制的，其余时候助手不动剪贴板）。在“加载解压缩的扩展”的文件夹窗口按 Ctrl+V，然后点“选择文件夹”。";}catch{status.Text="暂时无法访问剪贴板，请在上方路径框选中扩展路径后按 Ctrl+C。";}};Controls.Add(copy);
        manage.Text="打开扩展管理页";manage.SetBounds(215,353,205,36);manage.Click+=delegate {OpenManagement();};Controls.Add(manage);
        workbench.Text="如何打开工作台";workbench.SetBounds(435,353,210,36);workbench.Enabled=false;workbench.Click+=delegate {
            string prefix=detected!=null?"校事笺加载在「"+ProfileName(detected.profile)+"」配置，请在该配置下打开。":"";
            status.Text=prefix+"打开工作台任选其一：① 双击桌面“校事笺”快捷方式；② 点浏览器工具栏右上角的校事笺图标；③ 在扩展管理页点校事笺的“详细信息”，里面有工作台链接。若浏览器显示无法访问：当前打开的不是加载校事笺的那个用户配置，切换配置后再试（ Edge 右上角头像可切换）。";
        };Controls.Add(workbench);
        AddLabel("管理页网址",30,408,105,28);managementAddress.SetBounds(140,405,395,28);managementAddress.ReadOnly=true;Controls.Add(managementAddress);
        urlCopy.Text="复制网址";urlCopy.SetBounds(545,403,100,32);urlCopy.FlatStyle=FlatStyle.Flat;urlCopy.Click+=delegate {try{Clipboard.SetText(managementAddress.Text);status.Text="管理页网址已复制（这是你主动复制的）。到浏览器地址栏按 Ctrl+V、回车进入扩展管理页。";}catch{status.Text="暂时无法访问剪贴板，请在上方网址框选中管理页网址后按 Ctrl+C。";}};Controls.Add(urlCopy);
        browser.SelectedIndexChanged+=delegate {UpdateManagementAddress();ScheduleDetection();};UpdateManagementAddress();
        AddLabel("① 点“复制网址”，粘贴到浏览器地址栏并回车，进入扩展管理页。\r\n② 先打开“开发人员模式”开关：Edge 在页面左下角，Chrome 在页面右上角（容易漏看）。\r\n③ 点“加载解压缩的扩展”，点“复制扩展路径”后在文件夹窗口按 Ctrl+V 粘贴，再“选择文件夹”。\r\n④ 加载完成，校事笺自动打开工作台；以后从桌面“校事笺”进入。",30,443,615,94);
        status.SetBounds(30,543,615,62);status.Text="点“复制网址”粘贴到浏览器地址栏进入扩展管理页；点“准备安装”准备文件并创建桌面入口。助手只在你点复制按钮时才写剪贴板。";status.ForeColor=Color.FromArgb(87,112,84);Controls.Add(status);
        detectLabel.SetBounds(30,611,615,26);detectLabel.ForeColor=Color.FromArgb(87,112,84);detectLabel.Font=new Font(Font.FontFamily,10,FontStyle.Bold);Controls.Add(detectLabel);
        AddLabel("更换安装位置会改变本地扩展 ID。已有数据请先导出备份，再在新工作台恢复。",30,643,615,44);
        FormClosing+=delegate(object sender,FormClosingEventArgs e){if(preparing){e.Cancel=true;status.Text="正在校验和放置文件，请稍候完成后再关闭。";}};
        if(testProfile==null){detectDebounce.Interval=600;detectDebounce.Tick+=delegate{RunDetection();};ScheduleDetection();}
    }
    void ScheduleDetection(){if(testProfile!=null)return;detectDebounce.Stop();detectDebounce.Start();}
    // Startup / change-time check: is 校事笺 already prepared here, and is it already loaded in the browser?
    void RunDetection() {
        detectDebounce.Stop();
        if(preparing||installed!=null)return;
        detected=null;detectedResult=null;copy.Enabled=workbench.Enabled=false;
        string kind=browser.SelectedIndex==0?"edge":"chrome";string root=folder.Text.Trim(),target;
        try{target=Path.Combine(Path.GetFullPath(root),"Extension");}catch{return;}
        var loaded=Setup.DetectLoaded(kind,target,testProfile);
        InstallResult receipt=null;
        try{string receiptFile=Path.Combine(root,"install-receipt.json");if(File.Exists(receiptFile)){var parsed=Setup.Json.Deserialize<InstallResult>(File.ReadAllText(receiptFile));if(parsed!=null&&parsed.success&&!String.IsNullOrEmpty(parsed.folder))receipt=parsed;}}catch{}
        string vendor=kind=="edge"?"Edge":"Chrome";
        if(loaded!=null) {
            detected=loaded;
            string browserPath=Setup.FindBrowser(kind);
            if(browserPath!=null)detectedResult=new InstallResult{success=true,version=loaded.version,folder=loaded.folder,extensionId=loaded.id,browser=kind,browserPath=browserPath,dashboardUrl="chrome-extension://"+loaded.id+"/dashboard.html",manualConfirmationRequired=false};
            if(!String.Equals(Setup.NormalizeDir(Path.GetDirectoryName(Path.GetFullPath(loaded.folder))),Setup.NormalizeDir(root),StringComparison.OrdinalIgnoreCase)&&Directory.Exists(Path.GetDirectoryName(loaded.folder))) {
                applyingResult=true;folder.Text=Path.GetDirectoryName(loaded.folder);applyingResult=false;UpdateLoadPath();
            }
            string profileName=ProfileName(loaded.profile);
            detectLabel.Text="检测结果：校事笺 "+(loaded.version??"")+" 已在"+vendor+"「"+profileName+"」配置"+(loaded.enabled?"中加载，不必重新安装":"中加载但已被停用");
            detectLabel.ForeColor=loaded.enabled?Color.FromArgb(23,111,98):Color.FromArgb(176,108,22);
            status.Text=loaded.enabled
                ?"检测到已有安装（"+loaded.folder+"），无需重新准备。点“如何打开工作台”查看打开方法；重新准备文件仅用于更新或修复。"
                :"检测到校事笺在"+vendor+"的「"+profileName+"」配置中加载，但当前处于停用状态。请点“打开扩展管理页”重新开启。";
            copy.Enabled=manage.Enabled=workbench.Enabled=true;
            install.Text=loaded.version==Setup.Plan.version?"文件已就绪（重新准备可修复）":"准备安装并打开浏览器（更新文件）";
        } else if(receipt!=null) {
            detectLabel.Text="检测结果：此前已准备过文件 v"+receipt.version+"，"+vendor+"里尚未检测到已加载";detectLabel.ForeColor=Color.FromArgb(176,108,22);
            status.Text="检测到此前用助手准备过文件（位于 "+receipt.folder+"）。若这个浏览器里还没加载，点“打开扩展管理页”完成首次加载即可，不必重新准备。";
            copy.Enabled=manage.Enabled=workbench.Enabled=true;
            detectedResult=new InstallResult{success=true,version=receipt.version,folder=receipt.folder,extensionId=receipt.extensionId,browser=kind,browserPath=receipt.browserPath??Setup.FindBrowser(kind),dashboardUrl=receipt.dashboardUrl,manualConfirmationRequired=true};
        } else {
            detectLabel.Text="检测结果：未发现已安装的校事笺，按首次安装进行";detectLabel.ForeColor=Color.FromArgb(120,120,120);
        }
    }
    static string ProfileName(string profilePath){try{return String.IsNullOrEmpty(profilePath)?"当前配置":Path.GetFileName(profilePath);}catch{return "当前配置";}}
    void UpdateManagementAddress(){managementAddress.Text=(browser.SelectedIndex==0?"edge":"chrome")+"://extensions/";}
    void OpenManagement() {
        managementOpened=false;
        try {
            Setup.Launch(Setup.FindBrowser(browser.SelectedIndex==0?"edge":"chrome"),"about:blank",testProfile,"--new-window");
            managementOpened=true;
            // 不写剪贴板：网址显示在界面上，由用户点“复制网址”或选中后 Ctrl+C 自行复制。
            status.Text="浏览器新窗口已打开（未动你的剪贴板）。请复制上方“管理页网址”粘贴到地址栏并回车；进入后先打开“开发人员模式”开关（Edge 左下角 / Chrome 右上角），再点“加载解压缩的扩展”，点“复制扩展路径”后在文件夹窗口按 Ctrl+V 粘贴。";
        }catch(Exception error){status.Text="浏览器未打开："+error.Message+" 请手动启动浏览器，复制上方“管理页网址”粘贴到地址栏打开。";}
    }
    internal bool TestManagementButton(string report) {
        manage.PerformClick();
        File.WriteAllText(report,Setup.Json.Serialize(new {success=managementOpened,clipboardAddress=Clipboard.GetText(),managementAddress=managementAddress.Text,status=status.Text,buttonText=manage.Text,copyDirectoryEnabled=copy.Enabled}),new UTF8Encoding(false));return managementOpened;
    }
    void UpdateLoadPath(){try{loadPath.Text="扩展加载目录："+Path.Combine(folder.Text.Trim(),"Extension");}catch{loadPath.Text="请填写有效的安装位置。";}}
    void BrowseClick(object sender,EventArgs e) {
        try {using(var dialog=new FolderBrowserDialog()) {
            dialog.Description="选择安装位置，可新建空文件夹；选择磁盘或已有其他文件的目录时，将自动使用其 Xiaoshijian 子目录。";dialog.ShowNewFolderButton=true;
            if(Directory.Exists(folder.Text))dialog.SelectedPath=folder.Text;
            if(dialog.ShowDialog(this)!=DialogResult.OK)return;
            string selected=dialog.SelectedPath;
            if(String.Equals(selected.TrimEnd(Path.DirectorySeparatorChar),Path.GetPathRoot(selected).TrimEnd(Path.DirectorySeparatorChar),StringComparison.OrdinalIgnoreCase)||(Directory.EnumerateFileSystemEntries(selected).Any()&&!File.Exists(Path.Combine(selected,"install-receipt.json"))))selected=Path.Combine(selected,"Xiaoshijian");
            folder.Text=selected;
        }}catch(Exception error){status.Text="无法选择此目录："+error.Message;}
    }
    internal void ChooseBrowser(string kind){browser.SelectedIndex=kind=="chrome"?1:0;}
    internal void StartPreparation(){install.PerformClick();}
    void AddLabel(string text,int x,int y,int width,int height){var label=new Label {Text=text};label.SetBounds(x,y,width,height);Controls.Add(label);}
    async void InstallClick(object sender,EventArgs e) {
        preparing=true;install.Enabled=browser.Enabled=folder.Enabled=browse.Enabled=manage.Enabled=false;string kind=browser.SelectedIndex==0?"edge":"chrome";string selectedRoot=folder.Text.Trim();
        try {
            installed=await System.Threading.Tasks.Task.Run(()=>Setup.Install(selectedRoot,shortcutsOverride??Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),kind,s=>BeginInvoke(new Action(()=>status.Text=s))));
            applyingResult=true;folder.Text=Path.GetDirectoryName(installed.folder);applyingResult=false;copy.Enabled=manage.Enabled=workbench.Enabled=true;install.Text="文件已准备好";
            if(!noOpen){OpenManagement();if(installed.warning!=null)status.Text=installed.warning+" "+status.Text;}
            if(Completed!=null)Completed(installed);
        }catch(Exception error){status.Text=error.Message;install.Enabled=true;if(Completed!=null)Completed(new InstallResult{success=false,error=error.Message});else MessageBox.Show(this,error.Message,"安装未完成，原有数据保留",MessageBoxButtons.OK,MessageBoxIcon.Warning);}finally{preparing=false;browser.Enabled=folder.Enabled=browse.Enabled=manage.Enabled=true;}
    }
}
