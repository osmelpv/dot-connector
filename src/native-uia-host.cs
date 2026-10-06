// JSON bridge. Default build disables all native calls, including if --read is passed.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Web.Script.Serialization;
using DotConnector.Native;

public static class NativeHost {
  static void Require(bool ok) { if(!ok) throw new InvalidOperationException(); }
  static Dictionary<string,object> Fields(object value, params string[] names) {
    var fields=value as Dictionary<string,object>;
    Require(fields!=null && fields.Keys.OrderBy(k=>k).SequenceEqual(names.OrderBy(k=>k)));
    return fields;
  }
  static int Integer(object value,int min,int max) {
    Require(value is int);int n=(int)value;Require(n>=min && n<=max);return n;
  }
  static string Decimal(object value) {
    Require(value is string);string s=(string)value;long n;
    Require(Int64.TryParse(s,NumberStyles.None,CultureInfo.InvariantCulture,out n) && n>0 && n.ToString(CultureInfo.InvariantCulture)==s);return s;
  }
  static Target TargetFrom(object value) {
    var f=Fields(value,"hwnd","pid","startTimeTicks","panePath");
    var path=f["panePath"] as object[];Require(path!=null && path.Length>0 && path.Length<=16);
    var ids=new List<int[]>();
    foreach(object part in path){var id=part as object[];Require(id!=null && id.Length>0 && id.Length<=32);ids.Add(id.Select(n=>Integer(n,Int32.MinValue,Int32.MaxValue)).ToArray());}
    return new Target {hwnd=Decimal(f["hwnd"]),pid=Integer(f["pid"],1,Int32.MaxValue),startTimeTicks=Decimal(f["startTimeTicks"]),panePath=ids.ToArray()};
  }
  public static int Main(string[] argv) {
    try {
      Require(argv.Length==1 && (argv[0]=="--validate-only" || argv[0]=="--read"));
      Console.InputEncoding=new UTF8Encoding(false,true);Console.OutputEncoding=new UTF8Encoding(false,true);
      var input=new StringBuilder();int c;
      while((c=Console.In.Read())!=-1){Require(input.Length<16000);input.Append((char)c);}
      var json=new JavaScriptSerializer {MaxJsonLength=16000,RecursionLimit=64};
      var request=Fields(json.DeserializeObject(input.ToString()),"method","arguments");
      string method=request["method"] as string;Require(method=="observe" || method=="getVisibleRanges");
      var a=method=="observe" ? Fields(request["arguments"],"target","identityOnly") : Fields(request["arguments"],"target","maxRanges","maxCharacters","source");
      Target target=TargetFrom(a["target"]);int maxRanges=0,maxCharacters=0;
      if(method=="observe")Require(a["identityOnly"] is bool && (bool)a["identityOnly"]);
      else {maxRanges=Integer(a["maxRanges"],1,64);maxCharacters=Integer(a["maxCharacters"],1,16000);Require((a["source"] as string)=="TextPattern.GetVisibleRanges");}
      object result;
      if(argv[0]=="--validate-only") result=new {validated=true,method=method,target=target,nativeCalls=false};
      else {
#if NATIVE_RUNTIME_ENABLED
        result=method=="observe" ? (object)ReadOnlyProvider.Observe(target) : ReadOnlyProvider.GetVisibleRanges(target,maxRanges,maxCharacters);
#else
        throw new InvalidOperationException();
#endif
      }
      string output=json.Serialize(result);Require(Encoding.UTF8.GetByteCount(output)<=131072);Console.Out.Write(output);return 0;
    } catch { Console.Error.Write("Native host refused request; no details or terminal content logged.");return 1; }
  }
}
