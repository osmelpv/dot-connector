// User-run only. The agent must never execute --read for this manual probe.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;
using DotConnector.Native;
public static class ManualProbe {
  static void Require(bool ok){if(!ok)throw new InvalidOperationException();}
  static bool MatchLine(string text,string marker){return text.Split(new[]{'\r','\n'},StringSplitOptions.RemoveEmptyEntries).Any(line=>line.Trim()==marker);}
  public static int Main(string[] argv){
    try {
      Require(argv.Length==1 && (argv[0]=="--validate-only" || argv[0]=="--read" || argv[0]=="--self-test"));
      Console.InputEncoding=new UTF8Encoding(false,true);Console.OutputEncoding=new UTF8Encoding(false,true);
      var json=new JavaScriptSerializer {MaxJsonLength=4096,RecursionLimit=8};
      if(argv[0]=="--self-test"){
        Require(MatchLine("PS> Write-Output TEST\r\nTEST\r\nPS>","TEST"));
        Require(!MatchLine("PS> Write-Output TEST\r\nPS>","TEST"));
        Require(!MatchLine("prefixTESTsuffix", "TEST"));
        var refusal=new NativeReadException("TARGET_ELEVATED");Require(refusal.Code=="TARGET_ELEVATED" && !refusal.Message.Contains("TARGET_ELEVATED"));
        ReadOnlyProvider.CheckOwnIntegrityForTest();
        Console.Write("{\"selfTests\":5,\"passed\":true,\"uiAutomationCalls\":false,\"ownTokenQuery\":true}");return 0;
      }
      var input=new StringBuilder();int c;while((c=Console.In.Read())!=-1){Require(input.Length<4096);input.Append((char)c);}
      var request=json.DeserializeObject(input.ToString()) as Dictionary<string,object>;
      Require(request!=null && request.Count==2 && request.ContainsKey("method") && request.ContainsKey("arguments") && (request["method"] as string)=="getVisibleRanges");
      var a=request["arguments"] as Dictionary<string,object>;
      Require(a!=null && a.Count==2 && a.ContainsKey("manualTest") && a.ContainsKey("marker") && a["manualTest"] is bool && (bool)a["manualTest"]);
      string marker=a["marker"] as string;Require(marker!=null && Regex.IsMatch(marker,@"\ADOT_NATIVE_TEST_[A-Z0-9]{8,32}\z"));
      if(argv[0]=="--validate-only"){Console.Write("{\"validated\":true,\"nativeCalls\":false}");return 0;}
      Target target=ReadOnlyProvider.BindForegroundForManualTest();
      VisibleResponse response=ReadOnlyProvider.GetVisibleRanges(target,64,16000);
      bool matched=MatchLine(String.Concat(response.ranges.Select(range=>range.text)),marker);
      // Deliberately exclude text, ranges, raw exceptions, window titles and paths.
      Console.Write(json.Serialize(new {result=matched?"PASS":"FAIL",diagnostic=matched?"VISIBLE_MARKER_LINE_MATCHED":"VISIBLE_MARKER_LINE_NOT_FOUND",hwnd=target.hwnd,pid=target.pid,startTimeTicks=target.startTimeTicks,source=response.source,truncated=response.truncated}));return 0;
    }catch(NativeReadException e){
      Console.Write(new JavaScriptSerializer().Serialize(new {result="FAIL",diagnostic=e.Code,win32Error=e.Win32Error}));return 0;
    }catch{Console.Write("{\"result\":\"FAIL\",\"diagnostic\":\"HOST_REQUEST_OR_RUNTIME_FAILED\"}");return 0;}
  }
}
