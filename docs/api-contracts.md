# API Contracts

## Design Snapshot Ingestion
`POST /v1/design-snapshots`

Request body:
```json
{
  "tenantId": "tenant_123",
  "projectId": "project_456",
  "figmaFileId": "file_abc",
  "metadata": {
    "payloadVersion": "1.0.0",
    "schemaVersion": "1.0.0",
    "capturedAt": "2024-01-01T00:00:00.000Z",
    "producer": "figma-plugin@0.1.0"
  },
  "nodes": []
}
```

## Expected Node Shape
```json
{
  "id": "node_1",
  "name": "Primary Button",
  "type": "FRAME",
  "bounds": {
    "x": 0,
    "y": 0,
    "width": 120,
    "height": 40
  },
  "visible": true,
  "opacity": 1,
  "fills": [],
  "strokes": [],
  "text": null,
  "textStyle": {},
  "layout": {},
  "component": {},
  "styles": {
    "childCount": 0,
    "fillCount": 0,
    "strokeCount": 0,
    "hasText": false,
    "layoutMode": "NONE",
    "fontFamily": null,
    "componentId": null
  },
  "children": []
}
```

## Comparison Result Shape
```json
{
  "tenantId": "tenant_123",
  "projectId": "project_456",
  "status": "pass",
  "issues": []
}
```

## Session Context
`GET /v1/session-context`

Response body:
```json
{
  "ok": true,
  "context": {
    "tenantId": "tenant_123",
    "userId": "user_abc",
    "projects": [
      {
        "id": 1,
        "externalId": "project_456",
        "name": "Marketing Site",
        "figmaFiles": [
          {
            "id": 2,
            "externalId": "file_abc",
            "name": "Homepage"
          }
        ]
      }
    ]
  }
}
```

## Live Page Snapshot Extraction
`POST /v1/pages/snapshot`

Request body:
```json
{
  "tenantId": "tenant_123",
  "projectId": "project_456",
  "pageUrl": "http://localhost:3000",
  "schemaVersion": "1.0.0",
  "capture": {
    "viewportWidth": 1440,
    "viewportHeight": 1024,
    "deviceScaleFactor": 1,
    "userAgent": "Mozilla/5.0 ..."
  }
}
```

Response body:
```json
{
  "ok": true,
  "snapshot": {
    "tenantId": "tenant_123",
    "projectId": "project_456",
    "pageUrl": "http://localhost:3000",
    "schemaVersion": "1.0.0",
    "capture": {
      "viewportWidth": 1440,
      "viewportHeight": 1024,
      "deviceScaleFactor": 1,
      "userAgent": "Mozilla/5.0 ..."
    },
    "roots": []
  }
}
```

## Comparison Preview
`POST /v1/comparisons/preview`

Request body:
```json
{
  "designSnapshot": {
    "tenantId": "tenant_123",
    "projectId": "project_456",
    "figmaFileId": "file_abc",
    "metadata": {
      "payloadVersion": "1.0.0",
      "schemaVersion": "1.0.0",
      "capturedAt": "2024-01-01T00:00:00.000Z",
      "producer": "figma-plugin@0.1.0"
    },
    "nodes": []
  },
  "pageSnapshot": {
    "tenantId": "tenant_123",
    "projectId": "project_456",
    "pageUrl": "http://localhost:3000",
    "schemaVersion": "1.0.0",
    "roots": []
  },
  "tolerancePx": 5
}
```

Response body:
```json
{
  "ok": true,
  "comparison": {
    "tenantId": "tenant_123",
    "projectId": "project_456",
    "status": "pass",
    "issues": []
  }
}
```

## Persisted Comparison Run
`POST /v1/comparisons`

Request body:
```json
{
  "tenantId": "tenant_123",
  "projectId": "project_456",
  "designSnapshot": {
    "tenantId": "tenant_123",
    "projectId": "project_456",
    "figmaFileId": "file_abc",
    "metadata": {
      "payloadVersion": "1.0.0",
      "schemaVersion": "1.0.0",
      "capturedAt": "2024-01-01T00:00:00.000Z",
      "producer": "figma-plugin@0.1.0"
    },
    "nodes": []
  },
  "pageSnapshot": {
    "tenantId": "tenant_123",
    "projectId": "project_456",
    "pageUrl": "http://localhost:3000",
    "schemaVersion": "1.0.0",
    "roots": []
  },
  "tolerancePx": 5
}
```

## Comparison History
`GET /v1/comparisons`

Query string:
```json
{
  "projectId": "project_456",
  "figmaFileId": "file_abc",
  "limit": "20"
}
```

## Comparison Run Detail
`GET /v1/comparisons/:id`

Response body:
```json
{
  "ok": true,
  "run": {
    "id": 1,
    "tenantId": 1,
    "projectId": 1,
    "status": "pass",
    "tolerancePx": 5,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "designSnapshot": {},
    "pageSnapshot": {},
    "issues": []
  }
}
```

## Comparison Report
`GET /v1/comparisons/:id/report`

Response body:
```json
{
  "ok": true,
  "report": {
    "runId": 1,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "tolerancePx": 5,
    "tenantId": "tenant_123",
    "projectId": "project_456",
    "figmaFileId": "file_abc",
    "summary": {
      "status": "pass",
      "totalIssues": 0,
      "minorIssues": 0,
      "majorIssues": 0,
      "criticalIssues": 0,
      "tolerancePx": 5
    },
    "issueGroups": [],
    "issuePatterns": [],
    "issues": [],
    "designSnapshot": {},
    "pageSnapshot": {}
  }
}
```

The dashboard can export the same report as JSON, CSV, or PDF.

## Comparison Feedback
`GET /v1/comparisons/:id/feedback`

Response body:
```json
{
  "ok": true,
  "feedback": [
    {
      "id": 1,
      "tenantId": 1,
      "comparisonRunId": 1,
      "createdByUserId": "user_123",
      "rating": 5,
      "sentiment": "positive",
      "notes": "Looks good in beta",
      "tags": ["beta", "happy-path"],
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

`POST /v1/comparisons/:id/feedback`

Request body:
```json
{
  "rating": 5,
  "sentiment": "positive",
  "notes": "Looks good in beta",
  "tags": ["beta", "happy-path"]
}
```

Response body:
```json
{
  "ok": true,
  "feedback": {
    "id": 1,
    "tenantId": 1,
    "comparisonRunId": 1,
    "createdByUserId": "user_123",
    "rating": 5,
    "sentiment": "positive",
    "notes": "Looks good in beta",
    "tags": ["beta", "happy-path"],
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

## Comparison Issue Status
`GET /v1/comparisons/:id/issues/statuses`

Response body:
```json
{
  "ok": true,
  "statuses": [
    {
      "id": 1,
      "tenantId": 1,
      "comparisonRunId": 1,
      "issueCode": "box-width-mismatch",
      "issuePath": "root.children[0]",
      "issueSeverity": "major",
      "status": "resolved",
      "note": "Reviewed in beta and confirmed acceptable",
      "resolvedByUserId": "user_123",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

`POST /v1/comparisons/:id/issues/statuses`

Request body:
```json
{
  "issueCode": "box-width-mismatch",
  "issuePath": "root.children[0]",
  "issueSeverity": "major",
  "status": "resolved",
  "note": "Reviewed in beta and confirmed acceptable"
}
```

Response body:
```json
{
  "ok": true,
  "status": {
    "id": 1,
    "tenantId": 1,
    "comparisonRunId": 1,
    "issueCode": "box-width-mismatch",
    "issuePath": "root.children[0]",
    "issueSeverity": "major",
    "status": "resolved",
    "note": "Reviewed in beta and confirmed acceptable",
    "resolvedByUserId": "user_123",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

## Tenant Comparison Tuning
`GET /v1/tenants/:tenantId/tuning`

Response body:
```json
{
  "ok": true,
  "tuning": {
    "tenantId": 1,
    "feedbackCount": 2,
    "averageRating": 3.5,
    "positiveCount": 1,
    "neutralCount": 0,
    "negativeCount": 1,
    "tagCounts": [
      { "tag": "spacing", "count": 1 },
      { "tag": "layout", "count": 1 }
    ],
    "recommendedTolerancePx": 7,
    "rationale": "mixed beta ratings, spacing/layout feedback"
  }
}
```

## Tenant Billing
`GET /v1/billing/:tenantId`

Response body:
```json
{
  "ok": true,
  "billing": {
    "tenantId": 1,
    "externalId": "tenant_123",
    "planName": "starter",
    "planStatus": "trialing",
    "trialEndsAt": null,
    "billingProvider": "manual",
    "billingCustomerId": null,
    "apiKeyCount": 0
  }
}
```

`POST /v1/billing/:tenantId/checkout-session`

Response body:
```json
{
  "ok": true,
  "billing": {
    "tenantId": 1,
    "externalId": "tenant_123",
    "planName": "starter",
    "planStatus": "trialing",
    "trialEndsAt": null,
    "billingProvider": "manual",
    "billingCustomerId": null,
    "apiKeyCount": 0
  },
  "action": {
    "provider": "manual",
    "url": null,
    "message": "Billing provider is not configured"
  }
}
```

`POST /v1/billing/:tenantId/portal-session`

Response body:
```json
{
  "ok": true,
  "billing": {
    "tenantId": 1,
    "externalId": "tenant_123",
    "planName": "starter",
    "planStatus": "trialing",
    "trialEndsAt": null,
    "billingProvider": "manual",
    "billingCustomerId": null,
    "apiKeyCount": 0
  },
  "action": {
    "provider": "manual",
    "url": null,
    "message": "Billing portal is not configured"
  }
}
```

## Release Management
`POST /v1/tenants/:tenantId/releases`

Request body:
```json
{
  "version": "0.1.1",
  "title": "Admin-authored update",
  "summary": "Release notes are now editable by tenant admins.",
  "highlights": ["Release creation", "Maintenance messages"]
}
```

Response body:
```json
{
  "ok": true,
  "release": {
    "version": "0.1.1",
    "releasedAt": "2024-01-01T00:00:00.000Z",
    "title": "Admin-authored update",
    "summary": "Release notes are now editable by tenant admins.",
    "highlights": ["Release creation", "Maintenance messages"]
  }
}
```

`POST /v1/tenants/:tenantId/maintenance`

Request body:
```json
{
  "message": "Planned maintenance tonight at 22:00 UTC."
}
```

Response body:
```json
  {
    "ok": true,
    "message": "Planned maintenance tonight at 22:00 UTC."
  }
  ```

## Announcement Feed
`GET /v1/announcements`

Response body:
```json
{
  "ok": true,
  "unreadCount": 2,
  "announcements": [
    {
      "id": 1,
      "kind": "release",
      "version": "0.1.2",
      "title": "Announcement feed",
      "summary": "Release and maintenance messages can now be acknowledged in-app.",
      "highlights": ["Unread announcements", "Per-user acknowledgements"],
      "message": "",
      "releasedAt": "2024-01-01T00:00:00.000Z",
      "acknowledged": false,
      "acknowledgedAt": null
    }
  ]
}
```

`POST /v1/announcements/:id/ack`

Response body:
```json
{
  "ok": true,
  "unreadCount": 1,
  "announcement": {
    "id": 1,
    "kind": "release",
    "version": "0.1.2",
    "title": "Announcement feed",
    "summary": "Release and maintenance messages can now be acknowledged in-app.",
    "highlights": ["Unread announcements", "Per-user acknowledgements"],
    "message": "",
    "releasedAt": "2024-01-01T00:00:00.000Z",
    "acknowledged": true,
    "acknowledgedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

## Tenant Usage
`GET /v1/tenants/:tenantId/usage`

Response body:
```json
{
  "ok": true,
  "usage": {
    "tenantId": 1,
    "externalId": "tenant_123",
    "planName": "starter",
    "planStatus": "trialing",
    "trialEndsAt": null,
    "snapshotCount": 12,
    "comparisonRunCount": 8,
    "apiKeyCount": 2,
    "webhookCount": 1,
    "activeWebhookCount": 1,
    "membershipCount": 3
  },
  "limits": {
    "maxSnapshots": 250,
    "maxComparisonRuns": 250,
    "maxApiKeys": 3,
    "maxWebhooks": 3,
    "maxMembers": 5
  },
  "withinLimits": true
}
```

## Tenant API Keys
`POST /v1/integrations/api-keys`

Request body:
```json
{
  "tenantId": "tenant_123",
  "name": "CI key",
  "scopes": ["comparisons:write"]
}
```

Response body:
```json
{
  "ok": true,
  "apiKey": {
    "id": 1,
    "tenantId": "tenant_123",
    "name": "CI key",
    "prefix": "abcd1234",
    "scopes": ["comparisons:write"],
    "createdAt": "2024-01-01T00:00:00.000Z",
    "rawKey": "d2p_abcd1234_..."
  }
}
```

Supported API key scopes:
- `comparisons:read`
- `comparisons:write`
- `reports:read`
- `webhooks:write`

`comparisons:read` can read comparison history and run detail.
`reports:read` can download comparison reports.
`comparisons:write` can create comparison runs.
`webhooks:write` is reserved for future webhook management endpoints.

`GET /v1/integrations/api-keys`

`POST /v1/integrations/api-keys/:id/revoke`

## Tenant Webhooks
`POST /v1/integrations/webhooks`

Request body:
```json
{
  "tenantId": "tenant_123",
  "name": "Local webhook",
  "targetUrl": "http://localhost:4000/webhook",
  "events": ["comparison.created", "comparison.failed"]
}
```

`GET /v1/integrations/webhooks`

Response body:
```json
{
  "ok": true,
  "webhooks": [
    {
      "id": 1,
      "tenantId": 1,
      "name": "Local webhook",
      "targetUrl": "http://localhost:4000/webhook",
      "secret": "wh_...",
      "events": ["comparison.created", "comparison.failed"],
      "createdAt": "2024-01-01T00:00:00.000Z",
      "revokedAt": null
    }
  ]
}
```

`POST /v1/integrations/webhooks/:id/revoke`

Webhook deliveries include these headers:
```json
{
  "x-webhook-event": "comparison.created",
  "x-webhook-timestamp": "2024-01-01T00:00:00.000Z",
  "x-webhook-signature": "sha256-hmac-hex",
  "x-webhook-version": "1"
}
```

Webhook body:
```json
{
  "eventType": "comparison.created",
  "data": {
    "eventId": "evt_1_comparison.created_1700000000000",
    "eventType": "comparison.created",
    "occurredAt": "2024-01-01T00:00:00.000Z",
    "tenantId": "tenant_123",
    "projectId": "project_456",
    "figmaFileId": "file_abc",
    "comparison": {
      "tenantId": "tenant_123",
      "projectId": "project_456",
      "status": "pass",
      "issues": []
    },
    "storedComparison": {
      "id": 1,
      "tenantId": 1,
      "projectId": 1,
      "status": "pass",
      "tolerancePx": 5,
      "createdAt": "2024-01-01T00:00:00.000Z"
    },
    "designSnapshot": {},
    "pageSnapshot": {}
  }
}
```

`GET /v1/integrations/webhooks/:id/deliveries`

`POST /v1/integrations/webhooks/:id/deliveries/:deliveryId/redeliver`

Response body:
```json
{
  "ok": true,
  "webhook": {
    "id": 1,
    "tenantId": 1,
    "name": "Local webhook",
    "targetUrl": "http://localhost:4000/webhook",
    "secret": "wh_...",
    "events": ["comparison.created"],
    "createdAt": "2024-01-01T00:00:00.000Z",
    "revokedAt": null
  },
  "deliveries": [
    {
      "id": 1,
      "tenantWebhookId": 1,
      "webhookName": "Local webhook",
      "eventType": "comparison.created",
      "payload": {},
      "responseStatus": 204,
      "errorText": null,
      "attemptCount": 1,
      "status": "delivered",
      "deliveredAt": "2024-01-01T00:00:00.000Z",
      "lastAttemptAt": "2024-01-01T00:00:00.000Z",
      "deadLetteredAt": null
    }
  ]
}
```

Redelivery response body:
```json
{
  "ok": true,
  "delivery": {
    "id": 2,
    "tenantWebhookId": 1,
    "webhookName": "Local webhook",
    "eventType": "comparison.created",
    "payload": {},
    "responseStatus": 204,
    "errorText": null,
    "attemptCount": 4,
    "status": "delivered",
    "deliveredAt": "2024-01-01T00:00:00.000Z",
    "lastAttemptAt": "2024-01-01T00:00:00.000Z",
    "deadLetteredAt": null
  }
}
```

Receivers verify `x-webhook-signature` with:
`HMAC_SHA256(secret, timestamp + "." + rawBody)`.

## Programmatic Comparison
`POST /v1/integrations/comparisons`

Headers:
```json
{
  "x-api-key": "d2p_abcd1234_..."
}
```

Request body:
```json
{
  "tenantId": "tenant_123",
  "projectId": "project_456",
  "designSnapshot": {},
  "pageSnapshot": {},
  "tolerancePx": 5
}
```

Response body:
```json
{
  "ok": true,
  "history": [
    {
      "id": 1,
      "tenantId": 1,
      "projectId": 1,
      "status": "pass",
      "tolerancePx": 5,
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

Response body:
```json
{
  "ok": true,
  "comparison": {
    "tenantId": "tenant_123",
    "projectId": "project_456",
    "status": "pass",
    "issues": []
  },
  "storedComparison": {
    "id": 1,
    "tenantId": 1,
    "projectId": 1,
    "status": "pass",
    "tolerancePx": 5,
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

## Comparison Report
`GET /v1/comparisons/:id/report`

Response body:
```json
{
  "ok": true,
  "report": {
    "runId": 1,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "tolerancePx": 5,
    "tenantId": "tenant_123",
    "projectId": "project_456",
    "figmaFileId": "file_abc",
    "summary": {
      "status": "pass",
      "totalIssues": 0,
      "minorIssues": 0,
      "majorIssues": 0,
      "criticalIssues": 0,
      "tolerancePx": 5
    },
    "issueGroups": [],
    "issues": [],
    "designSnapshot": {},
    "pageSnapshot": {}
  }
}
```
