def validate_settings(settings):
 return []
def collect(settings,host):
 return {"observation":{"rows":[{"key":key,"status":"healthy"} for key in settings["targets"]]},"resources":[{"collection":"items","complete":True,"reason":None,"items":[{"key":key,"label":key,"description":"Example target","selectable":True,"selection_reason":None,"state":{"key":"running","params":{}}} for key in ["a","b"]]}]}
def reduce(context):
 return context["observation"]
def evaluate(context):
 states={r["key"]:r["status"] for r in context["state"]["rows"]}
 return [{"from":context["now"],"facts":[],"subjects":[{"collection":"items","key":key,"status":states.get(key,"unknown"),"reason":{"key":"result","params":{"target":key,"state":states.get(key,"unknown")}},"facts":[]} for key in context["settings"]["targets"]]}]
