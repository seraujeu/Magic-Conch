# Workflow presets

Presets save a reusable group of configured nodes and the connections between them. Use one when a piece of a workflow—such as loading a file, asking a model, and parsing its response—will be useful in several workflows.

## Create a preset

1. Open the workflow editor.
2. Select one or more nodes. Hold **Shift** while selecting to build a multi-node selection, or drag a selection box around the nodes.
3. Select **Save preset** in the editor toolbar or the **+** beside Presets in the sidebar.
4. Enter a descriptive name and confirm.

The preset stores complete node settings and connections whose source and target are both selected. Connections to nodes outside the selection are intentionally omitted.

Start and End nodes cannot be included. Every workflow owns its single Start and End nodes; connect the inserted preset to those existing boundary nodes after insertion.

## Use a preset

Open **Presets** in the workflow sidebar and select a preset. Magic Conch inserts a new copy near the visible canvas area, assigns fresh node and connection IDs, and selects the inserted nodes. You can move the group and connect its exposed ports to the rest of the workflow. Inserting a preset is a normal workflow edit, so it can be undone.

Use the trash button beside a preset to remove the saved preset. Deleting a preset does not change nodes that were already inserted.

## Storage and portability

Presets are saved locally in the current browser profile. They are available to every workflow in that profile, but they are not included when an individual workflow is exported. If a preset contains a plug-in node or a **Use Workflow** node, the corresponding plug-in or called workflow must still exist when the inserted nodes run.

Do not store secrets directly in preset node settings. Provider credentials remain in application settings and are not copied into presets.
