using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;
using Microsoft.Win32;

namespace XiaoshijianBridge {
    internal static class NativeRegistration {
        internal const string HostName="com.xiaoshijian.mcp";
        internal static string Register(string executable,string extensionId,string browser,string registrationDir=null) {
            if(!Regex.IsMatch(extensionId??"","^[a-p]{32}$"))throw new Exception("扩展 ID 无效");
            if(browser!="chrome"&&browser!="edge"&&browser!="both")throw new Exception("浏览器仅支持 chrome / edge / both");
            executable=Path.GetFullPath(executable);if(!File.Exists(executable))throw new Exception("MCP 桥接程序不存在");
            string hash;using(var sha=SHA256.Create())hash=String.Concat(sha.ComputeHash(Encoding.UTF8.GetBytes(executable)).Take(10).Select(b=>b.ToString("x2")));
            string folder=registrationDir??Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"XiaoshijianMcp","Hosts",hash);
            Directory.CreateDirectory(folder);string manifest=Path.Combine(Path.GetFullPath(folder),"host.json");
            var json=new JavaScriptSerializer();
            File.WriteAllText(manifest,json.Serialize(new {name=HostName,description="校事笺本地 MCP 桥接",path=executable,type="stdio",allowed_origins=new[]{"chrome-extension://"+extensionId+"/"}}),new UTF8Encoding(false));
            foreach(string kind in browser=="both"?new[]{"chrome","edge"}:new[]{browser}) {
                string key=@"Software\"+(kind=="edge"?@"Microsoft\Edge":@"Google\Chrome")+@"\NativeMessagingHosts\"+HostName;
                foreach(var view in new[]{RegistryView.Registry32,RegistryView.Registry64})using(var root=RegistryKey.OpenBaseKey(RegistryHive.CurrentUser,view))using(var entry=root.CreateSubKey(key))entry.SetValue("",manifest,RegistryValueKind.String);
            }
            return manifest;
        }
    }
}
