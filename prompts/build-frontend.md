# Task: Implement Laundry ERP Frontend

You are a senior frontend engineer responsible for implementing the Laundry ERP web application.

## 1. Mandatory Instructions

Before starting, read:

1. `AGENTS.md`
2. `specs/constitution.md`
3. `specs/plan.md`, if available
4. `specs/tasks.md`, if available

Treat the approved constitution as the single source of truth for:

- FreshFold UI design system
- Theme tokens and styling
- Reusable components
- Frontend architecture and technology
- Cloudflare hosting
- Security and offline-first requirements

**Do not redefine, duplicate or override any constitutional rules.**

If a required component or token is missing, follow the constitution's component-extension process.

## 2. Objective

Implement a simple, responsive Laundry ERP frontend for non-technical front-desk employees and managers.

The frontend must use the FreshFold UI library defined in the constitution.

Visual reference:

https://www.behance.net/gallery/258087537/Laundry-Management-System-%28UIUX-Case-Study%29

Use this reference for inspiration where accessible. The existing FreshFold dashboard design is the preferred visual baseline.

## 3. Screens to Implement

### Dashboard
- Today's order summary
- Orders requiring attention
- Recent orders
- Quick actions

### Orders
- Create order
- View and search orders
- View order details
- Perform permitted order status transitions
- Reschedule delivery

### Deliveries
- Delivery schedule
- Available delivery slots
- Orders scheduled for delivery
- Rescheduling workflow

### Customers
- Customer directory
- Customer search
- Customer details
- Order history

## 4. Implementation Instructions

1. Inspect the repository before creating or modifying files.
2. Reuse the existing FreshFold UI library, or create it according to the constitution if it does not exist.
3. Implement the shared application layout.
4. Implement the four requested screens.
5. Use a typed mock API adapter when backend APIs are unavailable.
6. Keep the mock API separate from production integration.
7. Do not implement or modify backend business logic.
8. Add relevant frontend tests.
9. Verify responsive behavior and accessibility.
10. Run the available build, lint and test commands.

Do not create unnecessary abstractions or additional infrastructure.

## 5. Approval Gate

Check the project's current phase.

If Phase 1 is not approved:

- Produce the frontend implementation plan.
- Identify dependencies and unresolved decisions.
- Stop and request approval.

If Phase 1 is approved:

- Implement the frontend.
- Use mock data where necessary.
- Do not deploy to production without separate approval.

## 6. Deliverables

- Working frontend application
- Dashboard, Orders, Deliveries and Customers screens
- FreshFold UI integration
- Mock API adapter where required
- Frontend tests
- Local development instructions
- Cloudflare deployment configuration consistent with the constitution

## 7. Completion Report

Report:

- Files created or modified
- Screens implemented
- Shared components reused or added
- Tests executed and results
- Remaining issues
- Backend integration dependencies

**Important: The constitution defines the design system. This prompt only defines the implementation task.**