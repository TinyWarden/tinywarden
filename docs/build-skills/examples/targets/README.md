# Example deployment targets

A synthetic SDK 2 package demonstrating resource discovery, per-server selection
and independent target health. It returns fixed alpha/beta inventory and makes no
host requests. It is an authoring example, not a real deployment monitor.

Start with the [resource skill guide](../../resources.md). Copy this directory
outside the application checkout, validate it with the pinned Python SDK and run
its captured-observation tests in the supported delegated sandbox. Collection
returns healthy for selected targets; fixtures also cover critical and missing
observations. A selected target with no row becomes unknown.

The package is Apache-2.0. Preserve LICENSE when adapting it, select your own
namespace and implement collection through reviewed SDK capabilities.
