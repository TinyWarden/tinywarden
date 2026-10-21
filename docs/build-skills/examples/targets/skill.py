"""Synthetic SDK 2 target example; makes no host requests."""


def validate_settings(settings):
    return []


def collect(settings, host):
    inventory = [{"key": key, "label": key, "description": "Example deployment target",
                  "selectable": True, "selection_reason": None,
                  "state": {"key": "running", "params": {}}}
                 for key in ["alpha", "beta"]]
    return {"observation": {"rows": [{"key": key, "status": "healthy"}
                                     for key in settings["targets"]]},
            "resources": [{"collection": "items", "complete": True,
                           "reason": None, "items": inventory}]}


def reduce(context):
    return context["observation"]


def evaluate(context):
    states = {row["key"]: row["status"] for row in context["state"]["rows"]}
    subjects = []
    for key in context["settings"]["targets"]:
        status = states.get(key, "unknown")
        subjects.append({"collection": "items", "key": key, "status": status,
                         "reason": {"key": "result", "params": {"target": key, "state": status}},
                         "facts": []})
    return [{"from": context["now"], "subjects": subjects, "facts": []}]
