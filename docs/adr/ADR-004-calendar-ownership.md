# ADR-004: Calendar Ownership

**Status:** Proposed Phase 1
**Date:** 2026-11-11

## Context

The architecture document says the Google Calendar is owned by a service account. Google's official `calendars.insert` documentation warns that a service account used for authentication becomes the data owner and that ownership cannot be transferred.

## Decision

A real Google Workspace user is the calendar data owner. The service account is granted `writer` access through ACL. Front desk users receive `reader` access. Managers receive `writer` or `owner` as business requirements dictate.

## Consequences

- The service account is not the data owner.
- Calendar ownership can be transferred by the Workspace owner.
- The service account can write canonical events through the ACL.
- Setup requires creating the calendar as a real user and sharing it with the service account.

## Alternatives

- Service-account-owned calendar: rejected because Google explicitly warns against it and ownership cannot be transferred.
- Separate manager-owned calendar: prohibited by the master prompt.

## References

- https://developers.google.com/workspace/calendar/api/v3/reference/calendars/insert
- https://developers.google.com/workspace/calendar/api/v3/reference/acl/insert
- `specs/plan.md`
