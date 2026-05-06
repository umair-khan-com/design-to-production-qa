import type { PluginExportMode } from "./messages";
import type { FigmaLikeNode } from "./extract";

interface FigmaApiLike {
  showUI(html: string, options: { width: number; height: number; themeColors?: boolean }): void;
  closePlugin(message?: string): void;
  notify(message: string): void;
  ui: {
    postMessage(message: unknown): void;
    onmessage: ((message: unknown) => void) | null;
  };
  currentPage: {
    selection: FigmaLikeNode[];
    children: FigmaLikeNode[];
  };
}

declare const figma: FigmaApiLike;
declare const __html__: string;

export function getExportTargets(mode: PluginExportMode) {
  if (mode === "selection") {
    return figma.currentPage.selection.length > 0 ? figma.currentPage.selection : figma.currentPage.children;
  }

  return figma.currentPage.children;
}

export function openPluginUi(): void {
  figma.showUI(__html__, { width: 420, height: 640, themeColors: true });
}

export function sendStatus(message: string): void {
  figma.ui.postMessage({ type: "status", message });
}
