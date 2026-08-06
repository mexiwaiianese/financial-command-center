# Financial Control Center — Living Product Request Log

Last updated: August 5, 2026 (revision 13)

This document is the living record of requested FCC product behavior. It is updated and offered for download whenever a new request set is implemented.

## Navigation and responsive layout

- Use top-level Dashboard, Budget Comparison, Transaction Explorer, and Account Settings views.
- Keep Projects & Investments and Portfolio & Goals on the main dashboard.
- Route dashboard category selections into a filtered Transaction Explorer view.
- Keep all views mobile friendly.
- Use “Transaction Explorer” instead of “transaction drill-down.”

## Transactions and categorization

- Search transactions by description or provider and filter by common/custom date ranges.
- Filter by any category, subcategory, or project.
- Support staged manual category and project assignments with an explicit Save action.
- Recommend categories while preserving user control.
- Confirm exact and fuzzy description/amount matches in a popup before committing.
- Let users confirm matches individually, save, and choose “always apply rule.”
- Do not replace the visible list with a temporary similar-match filter.
- Automatically clear only system-created review filters when no matches remain.
- Show the matching transaction count beside the Rows selector.
- Sort dropdowns alphabetically by default; support most-used, recent, and custom ordering.
- Allow new categories and projects to be created from transaction dropdowns.
- Support primary budget categories and multiple secondary cross-cutting tags.
- Keep Groceries and Shopping separate under a shared Lifestyle & Household parent.
- Show filtered spending trends in Transaction Explorer.
- Add privacy-first “?” help for unidentified transactions.

## Notes and collaboration

- Add or view a note between the Project and Financial Provider columns.
- Tag registered users in notes.
- When tagging an unregistered person, request name, email, and access level.

## Rules

- Move “Avanti = Clothing” into Transaction Explorer as Find & Assign.
- Keep the label, expanding text area, Apply Rule button, and See Rules action together.
- Support reviewing and deleting existing rules.

## Providers, users, and access

- Use “Financial provider” as the flexible label for banks, credit unions, card issuers, brokerages, crypto platforms, and similar organizations.
- Rename and classify financial providers in Account Settings.
- Prepopulate Account Settings with providers and category hierarchies FCC has already identified, then merge imported records into those lists.
- Use least-privilege roles: Superadmin, Admin, Analyst, Contributor, and Viewer.
- Superadmins own the account; admins can manage users.
- Grant file-upload and new-provider connection permissions separately.
- Authenticate with device passkeys/WebAuthn; never store biometric data as a password.

## Budget and analysis

- Add suggested budget amounts to category comparisons.
- Show monthly budget as a horizontal trend-chart line.
- Color spending yellow above budget, orange above the rolling average, and red above both.
- Make spending-plan analysis and automatic sync collapsible.
- Proactively recommend category hierarchy realignment.

## Portfolio and goals

- Let users select monthly, quarterly, or yearly chart intervals and use the same interval for projections.
- Detect likely portfolio items and request missing balance/rate/contribution data.
- After uncategorized transactions are cleared, ask whether the user is ready to set goals.
- Provide “Help me decide” from both that dialog and the dashboard.

## Imports and operations

- Accept drag-and-drop files in upload areas.
- Automatically migrate the original pre-role account to Superadmin so file access is not accidentally revoked.
- Apply file-upload permissions consistently to statements, budgets, receipts, and backup restoration.
- Restart the FCC frontend and backend after implementation.
- Show a clear, temporary confirmation notification after settings are saved.

## Revision 6 — Explorer, settings, and confirmation refinements

- Edit existing category names, parent relationships, and monthly budgets; accept suggested realignments.
- Confirm Copy Lookup and require explicit approval plus a chosen provider before sending sanitized description keywords to a web search. Never send amounts or account/provider details.
- Support an “Only this” category filter, multiple simultaneous quick filters, visible filter chips, sortable headers, active-row highlighting, and customizable table columns.
- Hide Financial Provider and Classification by default; convey expense, deposit, and transfer classification through red, green, and yellow spend-impact text.
- Use category-stacked bars in the filtered spending trend and show actual-versus-budget category analysis for over-budget selections.
- Add visible disclosure carets, brighter status tiles, and a granular Start Over confirmation with selectable reset areas.
- Move Teller connection controls into Financial Providers settings; show connection status and manual sync controls for each provider.
- Use the complete category list for secondary tags and use “Tracking area” for household/project assignment.
- Rename “Add account” to “Add project account” and allow Teller sync selection.
- Keep historical and projected net-worth calculations on the same cash-flow basis.
- Deduplicate providers after renaming and show confirmations for changes and deletions.
- Rank similar transactions primarily by description relevance; add select-all, filters, sorting, and secondary tags.
- Confirm receipt matching and the suggested assignment before applying it.

## Revision 7 — projects, hierarchical charts, tags, and backups

- Allow project names, status, target budget, and projected revenue to be edited.
- Start stacked spending charts at parent-category level; clicking a segment filters transactions and drills into its subcategories.
- Organize quick filters into labeled review-status and tracking-area groups.
- Add searchable multiselect secondary tags, including independent custom tags.
- Add Account Settings management for creating and renaming secondary tags.
- Make moving a subcategory to another existing or newly named parent category explicit.
- Include transactions, categorization, tags, rules, projects and accounts, portfolio, goals, and safe account preferences in FCC backups. Passkey credentials and active login sessions remain device-bound and are excluded.

## Revision 8 — transfer categorization and income charts

- Allow transfer and income rows to use the category selector so misidentified paycheck transfers can be corrected manually.
- Plot the absolute transaction impact in filtered trend charts so deposits and income are visible instead of being clamped to zero.

## Revision 9 — settings labels and transaction types

- Label project name, status, target budget, and projected revenue fields.
- Make every Account Settings section collapsible with a visible disclosure caret.
- Prefix outgoing transaction amounts with a minus sign while retaining expense, deposit, and transfer colors.
- Allow transactions to be explicitly identified as expenses, income/paychecks, returns, reimbursements, or transfers.
- Add quick views for returns and reimbursements.

## Revision 10 — visual design refresh

- Refresh FCC with an original visual system blending approachable consumer-finance guidance, professional accounting clarity, and clean credit-health dashboards.
- Use a confident emerald palette, warmer canvas, clearer cards, stronger hierarchy, compact pill filters, polished tables and forms, and a sticky mobile-friendly navigation bar.
- Preserve FCC workflows and information density while improving focus, feedback, hover states, responsive layouts, and accessibility contrast.

## Revision 11 — category creation and chart colors

- Replace the parent-category browser prompt with an in-app dropdown of existing parent categories plus a “Create a new parent category” option.
- Create and assign the new subcategory from one confirmation dialog.
- Generate a distinct color for every visible category or subcategory stack instead of repeating a short fixed palette.

## Revision 12 — analytical exclusions and coordinated planning

- Let users exclude or restore individual outliers from 12-month rolling-average calculations.
- Collapse category groups by default, search the catalog, stage multiple edits, and save them together.
- Dynamically suggest fuzzy potential matches while entering a new category.
- Relate transactions to portfolio items and link liabilities to payoff goals.
- Support debt-payoff, cash-flow, investment, and net-worth plans with priority and parallel/sequenced pursuit modes.
- Add a household/project planning assistant that uses actual cash-flow capacity, constraints, priorities, and target dates to formulate a coordinated plan.

## Revision 13 — cross-provider transfer reconciliation

- Automatically pair exact opposite transaction amounts across different financial providers within five days.
- Mark both ledger entries as a reconciled internal transfer with a shared match identifier.
- Keep the two entries visible when reviewing either provider while excluding both from household spending and income analytics for a net-zero impact.
- Show a reconciliation badge that opens both sides of the transfer pair.
- Preserve manual transaction-type overrides so a paycheck or other non-transfer is not reclassified during later reconciliation.
