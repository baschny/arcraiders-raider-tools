# Change Request: Quartermaster Lists View Usability Improvements

## 1. Context
The "Lists" view in the Quartermaster app has several usability issues related to accidental deletions, title editing, and numerical input handling.

## 2. Proposed Changes

### 2.1 Confirmation Dialogs
- **Delete List**: Add a confirmation dialog when deleting a list that contains one or more items. Empty lists can still be deleted immediately.
- **Delete Item**: Add a confirmation dialog when deleting an item from a list.

### 2.2 List Title Editing
- Change the list title from an always-editable field (or whatever it is now) to a read-only headline.
- Add a "Pencil" icon/button next to the title with the tooltip "Edit title".
- Clicking the "Edit title" button transforms the title into an input field.
- Add a "Save" icon/button next to the input field to commit the changes and return to the read-only headline state.

### 2.3 Numerical Input Improvements
- Remove the browser-native numerical "up/down" value widget (spinners) from the quantity input fields.
- Ensure the field remains manually editable by typing.
- Rely exclusively on the application's own "-" and "+" buttons for incremental changes.

### 2.4 Item Row Layout
- Move the "Delete" button to the end of the item row (after the "Plus" button).
- This increases the distance between the "Enable/Disable" button and the "Delete" button to prevent accidental deletions.

## 3. Specification Updates

### 4.3 Lists View
- Update section to include confirmation dialog requirements.
- Update section to specify the new title editing workflow.
- Update section to explicitly forbid browser-native numerical spinners.
- Update section to specify the "Delete" button position at the end of the row.

## 4. Implementation Plan
1. Create this change request (Done).
2. Obtain user approval.
3. Update `docs/specifications/quartermaster/specification-quartermaster.md`.
4. Modify `src/apps/quartermaster/components/views/ListsView.tsx` and related components.
5. Update `src/apps/quartermaster/styles/_lists-view.scss` for the layout changes and spinner removal.
