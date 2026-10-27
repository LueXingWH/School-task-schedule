using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Reflection;
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
internal static class Setup {
    internal static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
    internal static readonly string DefaultRoot = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Xiaoshijian");
    internal static readonly InstallPlan Plan = Json.Deserialize<InstallPlan>(Encoding.UTF8.GetString(Resource("InstallPlan.json")));
    [STAThread]
    public static int Main(string[] args) {
        string resultFile = Value(args, "--result");
        try {
            string preview=Value(args,"--preview");
            if(preview!=null) {Application.EnableVisualStyles();using(var form=new SetupWindow()){form.ShowInTaskbar=false;form.StartPosition=FormStartPosition.Manual;form.Location=new Point(-20000,-20000);form.Show();Application.DoEvents();using(var bitmap=new Bitmap(form.Width,form.Height)){form.DrawToBitmap(bitmap,new Rectangle(Point.Empty,form.Size));bitmap.Save(preview,System.Drawing.Imaging.ImageFormat.Png);}form.Close();}return 0;}
            if (args.Contains("--install-only")) {
                string root = Value(args, "--root"); string shortcuts = Value(args, "--shortcuts-dir");
                if (String.IsNullOrEmpty(root) || String.IsNullOrEmpty(shortcuts) || String.IsNullOrEmpty(resultFile)) throw new Exception("测试/命令行安装必须指定 --root、--shortcuts-dir 和 --result。");
                var result = System.Threading.Tasks.Task.Run(()=>Install(root, shortcuts, Value(args, "--browser") ?? "edge", delegate(string s) {})).GetAwaiter().GetResult();
                File.WriteAllText(resultFile, Json.Serialize(result), new UTF8Encoding(false)); return 0;
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
    static string OwnedRoot(string root) {
        string full=Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar);
        if(!String.Equals(Path.GetFileName(full),"Xiaoshijian",StringComparison.OrdinalIgnoreCase))throw new Exception("安装目录末级必须为 Xiaoshijian。");
        for(var current=new DirectoryInfo(full);current!=null;current=current.Parent)if(current.Exists&&(current.Attributes&FileAttributes.ReparsePoint)!=0)throw new Exception("安装目录不能经过符号链接或目录联接。");
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
            File.WriteAllText(Path.Combine(root,"安装说明.txt"),"文件准备完成，还需要浏览器首次确认：\r\n1. 打开 "+(kind=="edge"?"edge":"chrome")+"://extensions\r\n2. 开启开发人员模式，点击加载解压缩的扩展。\r\n3. 选择以下目录：\r\n"+target+"\r\n\r\n加载完成将自动打开工作台，默认配置已就绪。后续可用桌面校事笺入口打开。更新前请导出完整备份。旧文件备份位于 .previous-* 目录，不包含浏览器数据库。",new UTF8Encoding(false));
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
    internal static void Launch(string browser,string argument) {Process.Start(new ProcessStartInfo(browser,"\""+argument+"\""){UseShellExecute=true});}
}

internal class SetupWindow:Form {
    readonly ComboBox browser=new ComboBox();readonly Button install=new Button(),copy=new Button(),manage=new Button(),workbench=new Button();readonly TextBox folder=new TextBox();readonly Label status=new Label();InstallResult installed;bool preparing;
    public SetupWindow() {
        Text="校事笺 · 便捷安装助手 "+Setup.Plan.version;Size=new Size(700,560);MinimumSize=Size;MaximumSize=Size;StartPosition=FormStartPosition.CenterScreen;Font=new Font("Microsoft YaHei UI",10);BackColor=Color.FromArgb(246,248,242);AutoScaleMode=AutoScaleMode.Dpi;MaximizeBox=false;
        var title=new Label {Text="收好通知，安装也轻一点",Font=new Font(Font.FontFamily,21,FontStyle.Bold),ForeColor=Color.FromArgb(23,111,98),Location=new Point(30,26),AutoSize=true};Controls.Add(title);
        AddLabel("自动放置离线资源 · 创建桌面入口 · 首次加载后自动配置",30,82,630,30);
        AddLabel("本助手准备本地文件。首次仍需在浏览器中开启开发人员模式并确认加载。",30,121,630,42);
        browser.SetBounds(30,174,260,36);browser.DropDownStyle=ComboBoxStyle.DropDownList;browser.Items.AddRange(new object[]{"Microsoft Edge（推荐）","Google Chrome"});browser.SelectedIndex=Setup.FindBrowser("edge")!=null?0:1;Controls.Add(browser);
        install.Text="准备安装并打开浏览器";install.SetBounds(315,169,330,43);install.BackColor=Color.FromArgb(23,111,98);install.ForeColor=Color.White;install.FlatStyle=FlatStyle.Flat;install.Click+=InstallClick;Controls.Add(install);
        folder.SetBounds(30,232,615,28);folder.ReadOnly=true;folder.Text=Path.Combine(Setup.DefaultRoot,"Extension");Controls.Add(folder);
        copy.Text="复制安装目录";copy.SetBounds(30,277,170,36);copy.Enabled=false;copy.Click+=delegate {Clipboard.SetText(folder.Text);status.Text="目录已复制。在浏览器的文件夹选择窗口按 Ctrl+V，然后确认。";};Controls.Add(copy);
        manage.Text="打开扩展管理页";manage.SetBounds(215,277,205,36);manage.Enabled=false;manage.Click+=delegate {Setup.Launch(installed.browserPath,(installed.browser=="edge"?"edge":"chrome")+"://extensions");};Controls.Add(manage);
        workbench.Text="加载完成后打开工作台";workbench.SetBounds(435,277,210,36);workbench.Enabled=false;workbench.Click+=delegate {Setup.Launch(installed.browserPath,installed.dashboardUrl);};Controls.Add(workbench);
        AddLabel("首次只需在打开的浏览器里：\r\n① 开启开发人员模式  ② 点击加载解压缩的扩展  ③ 选择上方目录",30,339,615,65);
        status.SetBounds(30,420,615,55);status.Text="无需账号、密钥或服务器。通知与附件由浏览器保存在本机。";status.ForeColor=Color.FromArgb(87,112,84);Controls.Add(status);
        AddLabel("已有旧版数据？请先导出完整备份，再在新工作台恢复。",30,481,615,25);
        FormClosing+=delegate(object sender,FormClosingEventArgs e){if(preparing){e.Cancel=true;status.Text="正在校验和放置文件，请稍候完成后再关闭。";}};
    }
    void AddLabel(string text,int x,int y,int width,int height){var label=new Label {Text=text};label.SetBounds(x,y,width,height);Controls.Add(label);}
    async void InstallClick(object sender,EventArgs e) {
        preparing=true;install.Enabled=false;browser.Enabled=false;string kind=browser.SelectedIndex==0?"edge":"chrome";
        try {
            installed=await System.Threading.Tasks.Task.Run(()=>Setup.Install(Setup.DefaultRoot,Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),kind,s=>BeginInvoke(new Action(()=>status.Text=s))));
            folder.Text=installed.folder;copy.Enabled=manage.Enabled=workbench.Enabled=true;install.Text="文件已准备好";
            try{Clipboard.SetText(installed.folder);status.Text=installed.warning??"目录已复制。浏览器确认加载后会自动进入工作台。";}catch{status.Text="文件已准备好，可点击复制目录继续。";}
            Setup.Launch(installed.browserPath,(kind=="edge"?"edge":"chrome")+"://extensions");
        }catch(Exception error){status.Text=error.Message;install.Enabled=true;browser.Enabled=true;MessageBox.Show(this,error.Message,"安装未完成，原有数据保留",MessageBoxButtons.OK,MessageBoxIcon.Warning);}finally{preparing=false;}
    }
}
