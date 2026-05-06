"use strict";
(() => {
  // plugins/figma/src/extract.ts
  var PLUGIN_VERSION = "0.1.0";
  function normalizeBounds(node) {
    if (node.absoluteBoundingBox) {
      return node.absoluteBoundingBox;
    }
    return {
      x: node.x ?? 0,
      y: node.y ?? 0,
      width: node.width ?? 0,
      height: node.height ?? 0
    };
  }
  function summarizePaint(paint) {
    const color = paint.color;
    return {
      type: typeof paint.type === "string" ? paint.type : "UNKNOWN",
      color: color && typeof color.r === "number" && typeof color.g === "number" && typeof color.b === "number" ? {
        r: color.r,
        g: color.g,
        b: color.b,
        a: typeof color.a === "number" ? color.a : 1
      } : void 0,
      opacity: typeof paint.opacity === "number" ? paint.opacity : void 0,
      visible: typeof paint.visible === "boolean" ? paint.visible : void 0,
      blendMode: typeof paint.blendMode === "string" ? paint.blendMode : void 0,
      imageHash: typeof paint.imageHash === "string" ? paint.imageHash : void 0
    };
  }
  function extractPaintSummaries(paints) {
    if (!Array.isArray(paints) || paints.length === 0) {
      return void 0;
    }
    return paints.map(summarizePaint);
  }
  function extractTextStyle(node) {
    if (node.type !== "TEXT") {
      return void 0;
    }
    return {
      fontName: typeof node.fontName === "string" ? node.fontName : node.fontName && typeof node.fontName.family === "string" ? node.fontName.family : void 0,
      fontSize: typeof node.fontSize === "number" ? node.fontSize : void 0,
      lineHeight: typeof node.lineHeight?.value === "number" ? node.lineHeight.value : void 0,
      letterSpacing: typeof node.letterSpacing?.value === "number" ? node.letterSpacing.value : void 0,
      textCase: typeof node.textCase === "string" ? node.textCase : void 0,
      textDecoration: typeof node.textDecoration === "string" ? node.textDecoration : void 0,
      paragraphIndent: typeof node.paragraphIndent === "number" ? node.paragraphIndent : void 0,
      paragraphSpacing: typeof node.paragraphSpacing === "number" ? node.paragraphSpacing : void 0,
      textAlignHorizontal: typeof node.textAlignHorizontal === "string" ? node.textAlignHorizontal : void 0,
      textAlignVertical: typeof node.textAlignVertical === "string" ? node.textAlignVertical : void 0
    };
  }
  function extractLayout(node) {
    const layout = {};
    if (typeof node.layoutMode === "string") layout.layoutMode = node.layoutMode;
    if (typeof node.primaryAxisSizingMode === "string") {
      layout.primaryAxisSizingMode = node.primaryAxisSizingMode;
    }
    if (typeof node.counterAxisSizingMode === "string") {
      layout.counterAxisSizingMode = node.counterAxisSizingMode;
    }
    if (typeof node.primaryAxisAlignItems === "string") {
      layout.primaryAxisAlignItems = node.primaryAxisAlignItems;
    }
    if (typeof node.counterAxisAlignItems === "string") {
      layout.counterAxisAlignItems = node.counterAxisAlignItems;
    }
    if (typeof node.itemSpacing === "number") layout.itemSpacing = node.itemSpacing;
    if (typeof node.paddingTop === "number") layout.paddingTop = node.paddingTop;
    if (typeof node.paddingRight === "number") layout.paddingRight = node.paddingRight;
    if (typeof node.paddingBottom === "number") layout.paddingBottom = node.paddingBottom;
    if (typeof node.paddingLeft === "number") layout.paddingLeft = node.paddingLeft;
    if (typeof node.strokeAlign === "string") layout.strokeAlign = node.strokeAlign;
    if (typeof node.cornerRadius === "number") layout.cornerRadius = node.cornerRadius;
    return Object.keys(layout).length > 0 ? layout : void 0;
  }
  function extractComponent(node) {
    const component = {};
    if (typeof node.componentId === "string") component.componentId = node.componentId;
    if (node.componentProperties && typeof node.componentProperties === "object") {
      component.componentProperties = node.componentProperties;
    }
    if (node.variantProperties && typeof node.variantProperties === "object") {
      component.variantProperties = node.variantProperties;
    }
    return Object.keys(component).length > 0 ? component : void 0;
  }
  function extractDesignNode(node, depth = 0, maxDepth = 8) {
    const fills = extractPaintSummaries(node.fills);
    const strokes = extractPaintSummaries(node.strokes);
    const textStyle = extractTextStyle(node);
    const layout = extractLayout(node);
    const component = extractComponent(node);
    const children = depth >= maxDepth ? [] : (node.children ?? []).map((child) => extractDesignNode(child, depth + 1, maxDepth));
    return {
      id: node.id,
      name: node.name,
      type: node.type,
      bounds: normalizeBounds(node),
      visible: typeof node.visible === "boolean" ? node.visible : void 0,
      opacity: typeof node.opacity === "number" ? node.opacity : void 0,
      fills,
      strokes,
      effects: Array.isArray(node.effects) ? node.effects : void 0,
      text: typeof node.characters === "string" ? node.characters : null,
      textStyle,
      layout,
      component,
      styles: {
        childCount: children.length,
        fillCount: fills?.length ?? 0,
        strokeCount: strokes?.length ?? 0,
        hasText: typeof node.characters === "string" && node.characters.length > 0,
        layoutMode: layout?.layoutMode ?? "NONE",
        fontFamily: textStyle?.fontName ?? null,
        componentId: component?.componentId ?? null
      },
      children
    };
  }
  function createDesignSnapshot(tenantId, projectId, figmaFileId, schemaVersion, nodes) {
    const metadata = {
      payloadVersion: "1.0.0",
      schemaVersion,
      capturedAt: (/* @__PURE__ */ new Date()).toISOString(),
      producer: `figma-plugin@${PLUGIN_VERSION}`
    };
    return {
      tenantId,
      projectId,
      figmaFileId,
      metadata,
      nodes: nodes.map((node) => extractDesignNode(node))
    };
  }

  // plugins/figma/src/runtime.ts
  function getExportTargets(mode) {
    if (mode === "selection") {
      return figma.currentPage.selection.length > 0 ? figma.currentPage.selection : figma.currentPage.children;
    }
    return figma.currentPage.children;
  }
  function openPluginUi() {
    figma.showUI('<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="utf-8" />\n    <title>Design to Production QA</title>\n    <style>\n      :root {\n        color-scheme: light dark;\n        font-family: Inter, Arial, sans-serif;\n      }\n\n      body {\n        margin: 0;\n        padding: 16px;\n        font-size: 12px;\n        line-height: 1.4;\n      }\n\n      header {\n        margin-bottom: 12px;\n      }\n\n      .row {\n        display: flex;\n        gap: 8px;\n        margin-bottom: 12px;\n        flex-wrap: wrap;\n      }\n\n      .grid {\n        display: grid;\n        grid-template-columns: 1fr;\n        gap: 8px;\n        margin-bottom: 12px;\n      }\n\n      label {\n        display: grid;\n        gap: 4px;\n      }\n\n      input,\n      select {\n        width: 100%;\n        box-sizing: border-box;\n        border-radius: 6px;\n        border: 1px solid rgba(127, 127, 127, 0.35);\n        padding: 8px 10px;\n        background: transparent;\n        color: inherit;\n      }\n\n      button {\n        appearance: none;\n        border: 1px solid rgba(127, 127, 127, 0.35);\n        border-radius: 6px;\n        padding: 8px 10px;\n        background: rgba(127, 127, 127, 0.12);\n        color: inherit;\n        cursor: pointer;\n      }\n\n      button:hover {\n        background: rgba(127, 127, 127, 0.2);\n      }\n\n      textarea {\n        width: 100%;\n        min-height: 360px;\n        box-sizing: border-box;\n        border-radius: 6px;\n        border: 1px solid rgba(127, 127, 127, 0.35);\n        padding: 10px;\n        background: transparent;\n        color: inherit;\n        resize: vertical;\n      }\n\n      .status {\n        min-height: 18px;\n        margin-bottom: 8px;\n        opacity: 0.9;\n      }\n    </style>\n  </head>\n  <body>\n    <header>\n      <strong>Design to Production QA</strong>\n    </header>\n\n    <div class="grid">\n      <label>\n        <span>API base URL</span>\n        <input id="api-base-url" type="url" placeholder="http://127.0.0.1:3001" />\n      </label>\n      <label>\n        <span>JWT</span>\n        <input id="jwt" type="password" placeholder="Bearer token" />\n      </label>\n      <label>\n        <span>Tenant ID</span>\n        <input id="tenant-id" type="text" readonly />\n      </label>\n      <label>\n        <span>Project</span>\n        <select id="project-id"></select>\n      </label>\n      <label>\n        <span>Figma File</span>\n        <select id="figma-file-id"></select>\n      </label>\n    </div>\n\n    <div class="row">\n      <button id="load-session" type="button">Load session</button>\n      <button id="extract-selection" type="button">Export selection</button>\n      <button id="extract-page" type="button">Export page</button>\n      <button id="upload-selection" type="button">Upload selection</button>\n      <button id="copy-json" type="button">Copy JSON</button>\n    </div>\n\n    <div class="status" id="status">Waiting for session.</div>\n    <textarea id="output" spellcheck="false" placeholder="JSON snapshot will appear here"></textarea>\n\n    <script>\n      const statusEl = document.getElementById("status");\n      const outputEl = document.getElementById("output");\n      const apiBaseUrlEl = document.getElementById("api-base-url");\n      const jwtEl = document.getElementById("jwt");\n      const tenantIdEl = document.getElementById("tenant-id");\n      const projectIdEl = document.getElementById("project-id");\n      const figmaFileIdEl = document.getElementById("figma-file-id");\n      const loadSessionButton = document.getElementById("load-session");\n      const selectionButton = document.getElementById("extract-selection");\n      const pageButton = document.getElementById("extract-page");\n      const uploadButton = document.getElementById("upload-selection");\n      const copyButton = document.getElementById("copy-json");\n\n      let sessionContext = null;\n\n      function setStatus(message) {\n        statusEl.textContent = message;\n      }\n\n      function currentSettings() {\n        return {\n          apiBaseUrl: apiBaseUrlEl.value.trim(),\n          jwt: jwtEl.value.trim(),\n          tenantId: tenantIdEl.value.trim(),\n          projectId: projectIdEl.value.trim(),\n          figmaFileId: figmaFileIdEl.value,\n        };\n      }\n\n      function send(type, mode) {\n        parent.postMessage({ pluginMessage: { type, mode, settings: currentSettings() } }, "*");\n      }\n\n      function populateProjects(context) {\n        projectIdEl.innerHTML = "";\n\n        context.projects.forEach((project) => {\n          const option = document.createElement("option");\n          option.value = project.externalId;\n          option.textContent = project.name ? `${project.name} (${project.externalId})` : project.externalId;\n          projectIdEl.appendChild(option);\n        });\n\n        if (context.projects.length > 0) {\n          projectIdEl.value = context.projects[0].externalId;\n          populateFiles(context.projects[0]);\n        } else {\n          figmaFileIdEl.innerHTML = "";\n        }\n      }\n\n      function populateFiles(project) {\n        figmaFileIdEl.innerHTML = "";\n\n        project.figmaFiles.forEach((file) => {\n          const option = document.createElement("option");\n          option.value = file.externalId;\n          option.textContent = file.name ? `${file.name} (${file.externalId})` : file.externalId;\n          figmaFileIdEl.appendChild(option);\n        });\n\n        if (project.figmaFiles.length > 0) {\n          figmaFileIdEl.value = project.figmaFiles[0].externalId;\n        }\n      }\n\n      loadSessionButton.addEventListener("click", () => {\n        setStatus("Loading session...");\n        send("load-session");\n      });\n\n      projectIdEl.addEventListener("change", () => {\n        if (!sessionContext) {\n          return;\n        }\n\n        const selectedProject = sessionContext.projects.find((project) => project.externalId === projectIdEl.value);\n        if (selectedProject) {\n          populateFiles(selectedProject);\n        }\n      });\n\n      selectionButton.addEventListener("click", () => {\n        setStatus("Exporting selection...");\n        send("extract-design", "selection");\n      });\n\n      pageButton.addEventListener("click", () => {\n        setStatus("Exporting page...");\n        send("extract-design", "page");\n      });\n\n      uploadButton.addEventListener("click", () => {\n        setStatus("Uploading selection...");\n        send("upload-design", "selection");\n      });\n\n      copyButton.addEventListener("click", async () => {\n        const value = outputEl.value;\n        if (!value) {\n          setStatus("Nothing to copy.");\n          return;\n        }\n\n        try {\n          await navigator.clipboard.writeText(value);\n          setStatus("Copied JSON to clipboard.");\n        } catch (error) {\n          outputEl.focus();\n          outputEl.select();\n          document.execCommand("copy");\n          setStatus("Copied JSON using fallback.");\n        }\n      });\n\n      window.onmessage = (event) => {\n        const message = event.data.pluginMessage;\n        if (!message) {\n          return;\n        }\n\n        if (message.type === "status") {\n          setStatus(message.message);\n          return;\n        }\n\n        if (message.type === "error") {\n          setStatus(message.message);\n          return;\n        }\n\n        if (message.type === "settings-loaded") {\n          apiBaseUrlEl.value = message.settings.apiBaseUrl || "";\n          jwtEl.value = message.settings.jwt || "";\n          tenantIdEl.value = message.settings.tenantId || "";\n          setStatus("Loaded saved settings.");\n          return;\n        }\n\n        if (message.type === "session-context-loaded") {\n          sessionContext = message.context;\n          tenantIdEl.value = message.context.tenantId;\n          populateProjects(message.context);\n          setStatus("Loaded session context.");\n          return;\n        }\n\n        if (message.type === "snapshot") {\n          outputEl.value = JSON.stringify(message.payload, null, 2);\n          setStatus(`Exported ${message.payload.nodes.length} root nodes.`);\n        }\n      };\n    <\/script>\n  </body>\n</html>\n', { width: 420, height: 640, themeColors: true });
  }
  function sendStatus(message) {
    figma.ui.postMessage({ type: "status", message });
  }

  // packages/shared/src/validation.ts
  var SUPPORTED_NODE_TYPES = /* @__PURE__ */ new Set([
    "FRAME",
    "GROUP",
    "INSTANCE",
    "COMPONENT",
    "TEXT",
    "RECTANGLE",
    "ELLIPSE",
    "VECTOR",
    "IMAGE",
    "BOOLEAN_OPERATION",
    "LINE"
  ]);
  function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }
  function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  function validateBounds(bounds, path, issues) {
    if (!isPlainObject(bounds)) {
      issues.push({ path, message: "bounds must be an object" });
      return;
    }
    for (const key of ["x", "y", "width", "height"]) {
      if (!isFiniteNumber(bounds[key])) {
        issues.push({ path: `${path}.${key}`, message: `${key} must be a finite number` });
      }
    }
  }
  function validateDesignNode(node, path, issues) {
    if (!node.id) issues.push({ path: `${path}.id`, message: "id is required" });
    if (!node.name) issues.push({ path: `${path}.name`, message: "name is required" });
    if (!SUPPORTED_NODE_TYPES.has(node.type)) {
      issues.push({ path: `${path}.type`, message: `unsupported node type: ${node.type}` });
    }
    validateBounds(node.bounds, `${path}.bounds`, issues);
    if (node.text !== null && typeof node.text !== "string") {
      issues.push({ path: `${path}.text`, message: "text must be string or null" });
    }
    if (!isPlainObject(node.styles)) {
      issues.push({ path: `${path}.styles`, message: "styles must be an object" });
    }
    if (!Array.isArray(node.children)) {
      issues.push({ path: `${path}.children`, message: "children must be an array" });
      return;
    }
    node.children.forEach((child, index) => validateDesignNode(child, `${path}.children[${index}]`, issues));
  }
  function validateSnapshotMetadata(metadata, path, issues) {
    if (!metadata.payloadVersion) {
      issues.push({ path: `${path}.payloadVersion`, message: "payloadVersion is required" });
    }
    if (!metadata.schemaVersion) {
      issues.push({ path: `${path}.schemaVersion`, message: "schemaVersion is required" });
    }
    if (!metadata.capturedAt) {
      issues.push({ path: `${path}.capturedAt`, message: "capturedAt is required" });
    }
    if (!metadata.producer) {
      issues.push({ path: `${path}.producer`, message: "producer is required" });
    }
  }
  function validateDesignSnapshot(payload) {
    const issues = [];
    if (!payload.tenantId) issues.push({ path: "tenantId", message: "tenantId is required" });
    if (!payload.projectId) issues.push({ path: "projectId", message: "projectId is required" });
    if (!payload.figmaFileId) issues.push({ path: "figmaFileId", message: "figmaFileId is required" });
    if (!payload.metadata) {
      issues.push({ path: "metadata", message: "metadata is required" });
    } else {
      validateSnapshotMetadata(payload.metadata, "metadata", issues);
    }
    if (!Array.isArray(payload.nodes)) {
      issues.push({ path: "nodes", message: "nodes must be an array" });
    } else {
      payload.nodes.forEach((node, index) => validateDesignNode(node, `nodes[${index}]`, issues));
    }
    return {
      valid: issues.length === 0,
      issues
    };
  }

  // plugins/figma/code.ts
  var DEFAULT_SCHEMA_VERSION = "1.0.0";
  var SETTINGS_STORAGE_KEY = "d2p.plugin.settings";
  var EMPTY_SETTINGS = {
    apiBaseUrl: "",
    jwt: "",
    tenantId: "",
    projectId: "",
    figmaFileId: ""
  };
  var currentSettings = { ...EMPTY_SETTINGS };
  openPluginUi();
  sendStatus("Loading saved settings...");
  async function loadSettings() {
    const stored = await figma.clientStorage.getAsync(SETTINGS_STORAGE_KEY);
    if (!stored || typeof stored !== "object") {
      return { ...EMPTY_SETTINGS };
    }
    const candidate = stored;
    return {
      apiBaseUrl: typeof candidate.apiBaseUrl === "string" ? candidate.apiBaseUrl : "",
      jwt: typeof candidate.jwt === "string" ? candidate.jwt : "",
      tenantId: typeof candidate.tenantId === "string" ? candidate.tenantId : "",
      projectId: typeof candidate.projectId === "string" ? candidate.projectId : "",
      figmaFileId: typeof candidate.figmaFileId === "string" ? candidate.figmaFileId : ""
    };
  }
  async function persistSettings(settings) {
    currentSettings = settings;
    await figma.clientStorage.setAsync(SETTINGS_STORAGE_KEY, settings);
  }
  async function fetchSessionContext(settings) {
    if (!settings.apiBaseUrl || !settings.jwt) {
      throw new Error("API base URL and JWT are required to load session context");
    }
    const response = await fetch(`${settings.apiBaseUrl.replace(/\/$/, "")}/v1/session-context`, {
      headers: {
        Authorization: `Bearer ${settings.jwt}`
      }
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Session lookup failed: ${response.status} ${text}`);
    }
    const payload = await response.json();
    return payload.context;
  }
  async function uploadSnapshot(snapshot, settings) {
    if (!settings.apiBaseUrl || !settings.jwt) {
      throw new Error("API base URL and JWT are required before upload");
    }
    const response = await fetch(`${settings.apiBaseUrl.replace(/\/$/, "")}/v1/design-snapshots`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.jwt}`
      },
      body: JSON.stringify(snapshot)
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Upload failed: ${response.status} ${text}`);
    }
  }
  function snapshotIdentityFrom(settings) {
    if (!settings.tenantId || !settings.projectId || !settings.figmaFileId) {
      throw new Error("Tenant, project, and figma file IDs are required");
    }
    return {
      tenantId: settings.tenantId,
      projectId: settings.projectId,
      figmaFileId: settings.figmaFileId
    };
  }
  function emitSessionContext(context) {
    figma.ui.postMessage({ type: "session-context-loaded", context });
  }
  async function handleSessionLoad(message) {
    const mergedSettings = {
      ...currentSettings,
      ...message.settings
    };
    await persistSettings(mergedSettings);
    const context = await fetchSessionContext(message.settings);
    const defaultProject = context.projects[0];
    const defaultFile = defaultProject?.figmaFiles[0];
    const hydratedSettings = {
      ...mergedSettings,
      tenantId: context.tenantId,
      projectId: mergedSettings.projectId || defaultProject?.externalId || "",
      figmaFileId: mergedSettings.figmaFileId || defaultFile?.externalId || ""
    };
    await persistSettings(hydratedSettings);
    emitSessionContext(context);
    figma.ui.postMessage({ type: "settings-loaded", settings: hydratedSettings });
    sendStatus("Session loaded.");
  }
  async function handleSnapshotAction(message) {
    const effectiveSettings = {
      ...currentSettings,
      ..."settings" in message ? message.settings : {}
    };
    await persistSettings(effectiveSettings);
    const identity = snapshotIdentityFrom(effectiveSettings);
    const targets = getExportTargets(message.mode);
    const snapshot = createDesignSnapshot(
      identity.tenantId,
      identity.projectId,
      identity.figmaFileId,
      DEFAULT_SCHEMA_VERSION,
      targets
    );
    const validation = validateDesignSnapshot(snapshot);
    if (!validation.valid) {
      const details = validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
      figma.ui.postMessage({
        type: "error",
        message: `Snapshot validation failed: ${details}`
      });
      figma.notify("Snapshot validation failed");
      return;
    }
    if (message.type === "upload-design") {
      await uploadSnapshot(snapshot, {
        apiBaseUrl: effectiveSettings.apiBaseUrl,
        jwt: effectiveSettings.jwt
      });
      figma.ui.postMessage({ type: "snapshot", payload: snapshot });
      figma.notify("Snapshot uploaded");
      return;
    }
    figma.ui.postMessage({ type: "snapshot", payload: snapshot });
    figma.notify(`Exported ${snapshot.nodes.length} root nodes`);
  }
  async function bootstrap() {
    currentSettings = await loadSettings();
    figma.ui.postMessage({ type: "settings-loaded", settings: currentSettings });
    sendStatus("Settings loaded.");
  }
  figma.ui.onmessage = (message) => {
    if (message.type === "load-session") {
      void handleSessionLoad(message).catch((error) => {
        const messageText = error instanceof Error ? error.message : "Unknown session error";
        figma.ui.postMessage({ type: "error", message: messageText });
        figma.notify(messageText);
      });
      return;
    }
    if (message.type !== "extract-design" && message.type !== "upload-design") {
      return;
    }
    void handleSnapshotAction(message).catch((error) => {
      const messageText = error instanceof Error ? error.message : "Unknown export error";
      figma.ui.postMessage({ type: "error", message: messageText });
      figma.notify(messageText);
    });
  };
  void bootstrap();
})();
