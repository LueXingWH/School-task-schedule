using System;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System.IO;
using System.IO.Pipes;
using System.Reflection;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

namespace XiaoshijianBridge {
    internal static class Program {
        const int RequestLimit=65536,ResponseLimit=900000;
        static readonly object OutputLock=new object();
        static readonly ConcurrentDictionary<string,TaskCompletionSource<Dictionary<string,object>>> Pending=new ConcurrentDictionary<string,TaskCompletionSource<Dictionary<string,object>>>();
        static readonly SemaphoreSlim Clients=new SemaphoreSlim(16);
        static readonly Encoding UTF8=new UTF8Encoding(false,true);
        static Stream NativeOutput;
        static JavaScriptSerializer Json(){return new JavaScriptSerializer{MaxJsonLength=1048576,RecursionLimit=40};}
        static Dictionary<string,object> Map(object value){return value as Dictionary<string,object>;}
        static object Get(Dictionary<string,object> map,string key){object value;return map!=null&&map.TryGetValue(key,out value)?value:null;}
        static string Str(Dictionary<string,object> map,string key){return Get(map,key) as string;}
        static string Option(string[] args,string key){int at=Array.IndexOf(args,key);return at>=0&&at+1<args.Length?args[at+1]:null;}
        static bool Has(string[] args,string key){return Array.IndexOf(args,key)>=0;}
        static string Version {get{return Assembly.GetExecutingAssembly().GetName().Version.ToString(3);}}

        static int Main(string[] args) {
            try {
                if(Has(args,"--register")) {
                    string manifest=NativeRegistration.Register(Assembly.GetExecutingAssembly().Location,Option(args,"--extension-id"),Option(args,"--browser")??"both",Option(args,"--registration-dir"));
                    Console.OutputEncoding=new UTF8Encoding(false);Console.WriteLine(Json().Serialize(new {registered=true,manifest=manifest}));return 0;
                }
                if(Has(args,"--mcp")){RunMcp(Option(args,"--instance"),Environment.GetEnvironmentVariable("XIAOSHIJIAN_MCP_TOKEN"));return 0;}
                if(args.Length>0&&Regex.IsMatch(args[0],"^chrome-extension://[a-p]{32}/$")){RunNative();return 0;}
                Console.Error.WriteLine("请从校事笺左侧的 MCP 配置模块复制配置。ZIP 安装时运行：Xiaoshijian.Mcp.exe --register --extension-id 扩展ID --browser both");return 1;
            }catch(Exception){Console.Error.WriteLine("校事笺 MCP 桥接启动失败，请重新连接或重新安装桥接程序。");return 1;}
        }

        static object ReadNative(Stream input) {
            byte[] header=new byte[4];int first=input.ReadByte();if(first<0)return null;header[0]=(byte)first;
            ReadExactly(input,header,1,3);int length=BitConverter.ToInt32(header,0);
            if(length<1||length>ResponseLimit)throw new Exception("消息大小超限");
            byte[] body=new byte[length];ReadExactly(input,body,0,length);return Json().DeserializeObject(UTF8.GetString(body));
        }
        static void ReadExactly(Stream stream,byte[] buffer,int start,int count){while(count>0){int n=stream.Read(buffer,start,count);if(n==0)throw new EndOfStreamException();start+=n;count-=n;}}
        static void WriteNative(object data) {
            byte[] bytes=UTF8.GetBytes(Json().Serialize(data));if(bytes.Length>ResponseLimit)throw new Exception("响应过大");
            lock(OutputLock){byte[] header=BitConverter.GetBytes(bytes.Length);NativeOutput.Write(header,0,4);NativeOutput.Write(bytes,0,bytes.Length);NativeOutput.Flush();}
        }
        static string ReadLine(Stream stream,int limit) {
            using(var buffer=new MemoryStream()){
                int value;while((value=stream.ReadByte())>=0){if(value==10)break;if(buffer.Length>=limit)throw new Exception("消息大小超限");buffer.WriteByte((byte)value);}
                if(value<0&&buffer.Length==0)return null;return UTF8.GetString(buffer.ToArray()).TrimEnd('\r');
            }
        }
        static void WriteLine(Stream stream,object data){byte[] bytes=UTF8.GetBytes(Json().Serialize(data)+"\n");if(bytes.Length>ResponseLimit)throw new Exception("响应过大");stream.Write(bytes,0,bytes.Length);stream.Flush();}
        static string PipeName(string instance){if(!Regex.IsMatch(instance??"","^[a-f0-9]{32}$"))throw new Exception("连接标识无效，请重新复制配置");return "xiaoshijian.mcp."+instance;}
        static bool TokenMatches(string left,string right){if(left==null||right==null||left.Length!=64||right.Length!=64)return false;int diff=0;for(int i=0;i<64;i++)diff|=left[i]^right[i];return diff==0;}
        static NamedPipeServerStream NewPipe(string instance) {
            var security=new PipeSecurity();security.SetAccessRuleProtection(true,false);
            security.AddAccessRule(new PipeAccessRule(new SecurityIdentifier(WellKnownSidType.NetworkSid,null),PipeAccessRights.FullControl,AccessControlType.Deny));
            security.AddAccessRule(new PipeAccessRule(WindowsIdentity.GetCurrent().User,PipeAccessRights.FullControl,AccessControlType.Allow));
            return new NamedPipeServerStream(PipeName(instance),PipeDirection.InOut,NamedPipeServerStream.MaxAllowedServerInstances,PipeTransmissionMode.Byte,PipeOptions.Asynchronous,4096,4096,security);
        }
        static void RunNative() {
            var input=Console.OpenStandardInput();NativeOutput=Console.OpenStandardOutput();
            var hello=Map(ReadNative(input));string instance=Str(hello,"instance"),token=Str(hello,"token");
            if(Str(hello,"type")!="hello"||!Regex.IsMatch(token??"","^[a-f0-9]{64}$"))throw new Exception("连接无效");
            var first=NewPipe(instance);
            Task.Run(()=>AcceptPipes(instance,token,first));
            WriteNative(new {type="ready",command=Assembly.GetExecutingAssembly().Location,version=Version});
            object value;while((value=ReadNative(input))!=null){var response=Map(value);string requestId=Str(response,"id");TaskCompletionSource<Dictionary<string,object>> done;if(requestId!=null&&Pending.TryRemove(requestId,out done))done.TrySetResult(response);}
            // Process lifetime is tied to the browser's native port. No background service remains.
            Environment.Exit(0);
        }
        static void AcceptPipes(string instance,string token,NamedPipeServerStream first) {
            var server=first;
            while(true){
                try{server.WaitForConnection();var connection=server;server=NewPipe(instance);
                    if(!Clients.Wait(0)){connection.Dispose();continue;}
                    Task.Run(()=>{try{ServePipe(connection,token);}finally{connection.Dispose();Clients.Release();}});
                }catch{return;}
            }
        }
        static void ServePipe(NamedPipeServerStream pipe,string token) {
            string id=null;
            try {
                var read=Task.Run(()=>ReadLine(pipe,RequestLimit));if(!read.Wait(5000))throw new Exception("请求读取超时");
                var request=Map(Json().DeserializeObject(read.Result));
                if(!TokenMatches(Str(request,"token"),token))throw new Exception("MCP 配置已失效或连接口令不正确，请重新复制配置");
                string client=Str(request,"client"),tool=Str(request,"tool");
                if(String.IsNullOrWhiteSpace(client)||client.Length>100||tool!="add_schedule"&&tool!="list_schedules")throw new Exception("调用参数无效");
                id=Guid.NewGuid().ToString("N");var done=new TaskCompletionSource<Dictionary<string,object>>();Pending[id]=done;
                WriteNative(new {type="call",id=id,client=client,tool=tool,args=Get(request,"args")});
                if(!done.Task.Wait(18000))throw new Exception("插件响应超时，结果未知；请用相同 request_id 和参数重试");
                var result=done.Task.Result;object error=Get(result,"error");
                WriteLine(pipe,error!=null?(object)new {ok=false,error=error}:new {ok=true,result=Get(result,"result")});
            }catch(Exception error){try{WriteLine(pipe,new {ok=false,error=error is AggregateException?"连接已中断，请重试":error.Message});}catch{}}
            finally{if(id!=null){TaskCompletionSource<Dictionary<string,object>> ignored;Pending.TryRemove(id,out ignored);}}
        }
        static object CallPlugin(string instance,string token,string client,string tool,object arguments) {
            if(!Regex.IsMatch(token??"","^[a-f0-9]{64}$"))throw new Exception("缺少 MCP 连接口令，请从左侧 MCP 配置模块重新复制配置");
            using(var pipe=new NamedPipeClientStream(".",PipeName(instance),PipeDirection.InOut,PipeOptions.Asynchronous)){
                try{pipe.Connect(3000);}catch(TimeoutException){throw new Exception("未连接校事笺：请保持浏览器运行，并在目标浏览器左侧的 MCP 配置模块启用接入");}
                WriteLine(pipe,new {token=token,client=client,tool=tool,args=arguments});
                var read=Task.Run(()=>ReadLine(pipe,ResponseLimit));if(!read.Wait(22000))throw new Exception("日程请求超时，结果未知；请用相同 request_id 和参数重试");
                if(String.IsNullOrEmpty(read.Result))throw new Exception("浏览器连接已关闭；请保持浏览器运行后用相同 request_id 重试");
                var response=Map(Json().DeserializeObject(read.Result));if(!(Get(response,"ok") is bool)||!(bool)Get(response,"ok"))throw new Exception(Str(response,"error")??"插件连接失败");
                return Get(response,"result");
            }
        }

        static void RpcResult(Stream output,object id,object result){WriteLine(output,new {jsonrpc="2.0",id=id,result=result});}
        static void RpcError(Stream output,object id,int code,string message){WriteLine(output,new {jsonrpc="2.0",id=id,error=new {code=code,message=message}});}
        static void RunMcp(string instance,string token) {
            var input=Console.OpenStandardInput();var output=Console.OpenStandardOutput();
            bool initialized=false,ready=false;string client="MCP client";
            object tools;using(var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("Tools.json"))using(var reader=new StreamReader(stream,UTF8))tools=Json().DeserializeObject(reader.ReadToEnd());
            while(true){
                string line;try{line=ReadLine(input,RequestLimit);}catch{RpcError(output,null,-32700,"请求无效或超过 64 KB");return;}
                if(line==null)return;if(String.IsNullOrWhiteSpace(line))continue;
                Dictionary<string,object> request;try{request=Map(Json().DeserializeObject(line));}catch{RpcError(output,null,-32700,"无效 JSON");continue;}
                object id=Get(request,"id");string method=Str(request,"method");
                if(request==null||Str(request,"jsonrpc")!="2.0"||String.IsNullOrEmpty(method)||(request.ContainsKey("id")&&(id==null||!(id is string||id is int||id is long||id is decimal)))){RpcError(output,null,-32600,"无效 JSON-RPC 请求");continue;}
                var parameters=Map(Get(request,"params"));
                if(!request.ContainsKey("id")){if(method=="notifications/initialized"&&initialized)ready=true;continue;}
                if(method=="ping"){RpcResult(output,id,new {});continue;}
                if(method=="initialize"){
                    if(initialized){RpcError(output,id,-32600,"已初始化");continue;}
                    string requested=Str(parameters,"protocolVersion");var info=Map(Get(parameters,"clientInfo"));string name=Str(info,"name");
                    if(String.IsNullOrEmpty(requested)||String.IsNullOrWhiteSpace(name)||name.Length>100){RpcError(output,id,-32602,"初始化参数无效");continue;}
                    client=name.Trim();initialized=true;
                    string negotiated=requested=="2025-06-18"||requested=="2024-11-05"?requested:"2025-11-25";
                    RpcResult(output,id,new {protocolVersion=negotiated,capabilities=new {tools=new {listChanged=false}},serverInfo=new {name="xiaoshijian",title="校事笺",version=Version},instructions="请按用户要求添加日程。日期时刻按目标浏览器本地时区。请求超时必须复用相同 request_id 和参数重试。"});continue;
                }
                if(!ready){RpcError(output,id,-32000,"请先完成 initialize 和 notifications/initialized");continue;}
                if(method=="tools/list"){RpcResult(output,id,new {tools=tools});continue;}
                if(method!="tools/call"){RpcError(output,id,-32601,"不支持的方法");continue;}
                string tool=Str(parameters,"name");object arguments=Get(parameters,"arguments")??new Dictionary<string,object>();
                if(tool!="add_schedule"&&tool!="list_schedules"||Map(arguments)==null){RpcError(output,id,-32602,"工具名或参数无效");continue;}
                try{object result=CallPlugin(instance,token,client,tool,arguments);RpcResult(output,id,new {content=new[]{new {type="text",text=Json().Serialize(result)}},structuredContent=result,isError=false});}
                catch(Exception error){RpcResult(output,id,new {content=new[]{new {type="text",text=error is AggregateException?"连接已中断；请用相同 request_id 重试":error.Message}},isError=true});}
            }
        }
    }
}
