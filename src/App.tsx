import React from "react";
import { ToolId } from "./types";
import { getToolById } from "./lib/toolRegistry";
import { useRouter, router } from "./lib/router";
import { useCompressionSession } from "./lib/compressionSessionStore";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import { Homepage } from "./components/Homepage";
import { ImagesToPdfWorkspace } from "./components/ImagesToPdfWorkspace";
import { MergePdfWorkspace } from "./components/MergePdfWorkspace";
import { SplitPdfWorkspace } from "./components/SplitPdfWorkspace";
import { RotatePdfWorkspace } from "./components/RotatePdfWorkspace";
import { PdfToImagesWorkspace } from "./components/PdfToImagesWorkspace";
import { OrganizePdfWorkspace } from "./components/OrganizePdfWorkspace";
import { PageNumbersWorkspace } from "./components/PageNumbersWorkspace";
import { WatermarkWorkspace } from "./components/WatermarkWorkspace";
import { CompressPdfWorkspace } from "./components/CompressPdfWorkspace";
import { PrivacyModal, HelpModal } from "./components/Modals";
import "./style.css";

export default function App() {
  const route = useRouter();
  const compressionSession = useCompressionSession();

  const currentView: "home" | ToolId = (route.toolId as "home" | ToolId) || "home";
  const activeTool = currentView !== "home" ? getToolById(currentView) : undefined;

  const navigateTo = (view: "home" | ToolId) => {
    router.navigate({
      toolId: view,
      stage: "upload",
    });
  };

  const isPrivacyOpen = route.overlay === "privacy";
  const isHelpOpen = route.overlay === "help";

  // Check if a background compression completed while the user is on a different screen
  const isBackgroundJobReady =
    compressionSession.jobStatus === "completed" &&
    compressionSession.result !== null &&
    (route.toolId !== "compress-pdf" || route.stage !== "result");

  return (
    <div className="folio-app">
      {/* Universal Paper Studio Header */}
      <Header
        currentView={currentView}
        onNavigate={navigateTo}
        onOpenPrivacy={() => router.openOverlay("privacy")}
        onOpenHelp={() => router.openOverlay("help")}
        toolTitle={activeTool?.title}
      />

      {/* Background Task Ready Toast Banner */}
      {isBackgroundJobReady && (
        <aside className="global-bg-toast" role="status" aria-live="polite">
          <div className="bg-toast-content">
            <span className="bg-toast-icon">✓</span>
            <div className="bg-toast-text">
              <strong>Compression complete!</strong>
              <span>
                {compressionSession.fileInfo?.name} (
                {compressionSession.result?.isReduced
                  ? `−${compressionSession.result.percentSaved}% saved`
                  : "already optimized"}
                )
              </span>
            </div>
          </div>
          <button
            type="button"
            className="btn-toast-view"
            onClick={() =>
              router.navigate({ toolId: "compress-pdf", stage: "result" })
            }
          >
            View Result →
          </button>
        </aside>
      )}

      {/* Main View Router */}
      <main className="folio-main-content">
        {route.isUnknown ? (
          <div className="folio-workspace not-found-workspace">
            <div className="empty-dropzone">
              <h2>Page Not Found</h2>
              <p>The requested PDF tool or page could not be found.</p>
              <button
                type="button"
                className="btn-primary-action"
                onClick={() => router.navigate({ toolId: "home" })}
              >
                Back to Homepage
              </button>
            </div>
          </div>
        ) : (
          <>
            {currentView === "home" && (
              <Homepage
                onSelectTool={(id) => navigateTo(id)}
                onExploreTools={() => {
                  const el = document.getElementById("tools-section");
                  el?.scrollIntoView({ behavior: "smooth" });
                }}
              />
            )}

            {currentView === "images-to-pdf" && (
              <ImagesToPdfWorkspace onBackToHome={() => navigateTo("home")} />
            )}

            {currentView === "merge-pdf" && (
              <MergePdfWorkspace onBackToHome={() => navigateTo("home")} />
            )}

            {currentView === "split-pdf" && (
              <SplitPdfWorkspace onBackToHome={() => navigateTo("home")} />
            )}

            {currentView === "rotate-pdf" && (
              <RotatePdfWorkspace onBackToHome={() => navigateTo("home")} />
            )}

            {currentView === "pdf-to-images" && (
              <PdfToImagesWorkspace onBackToHome={() => navigateTo("home")} />
            )}

            {currentView === "organize-pdf" && (
              <OrganizePdfWorkspace onBackToHome={() => navigateTo("home")} />
            )}

            {currentView === "page-numbers" && (
              <PageNumbersWorkspace onBackToHome={() => navigateTo("home")} />
            )}

            {currentView === "watermark" && (
              <WatermarkWorkspace onBackToHome={() => navigateTo("home")} />
            )}

            {currentView === "compress-pdf" && (
              <CompressPdfWorkspace onBackToHome={() => navigateTo("home")} />
            )}
          </>
        )}
      </main>

      {/* Universal Paper Studio Footer */}
      <Footer
        onOpenPrivacy={() => router.openOverlay("privacy")}
        onOpenHelp={() => router.openOverlay("help")}
        onNavigateHome={() => navigateTo("home")}
      />

      {/* Global History-Backed Modals */}
      <PrivacyModal
        isOpen={isPrivacyOpen}
        onClose={() => router.closeOverlay()}
      />

      <HelpModal
        isOpen={isHelpOpen}
        onClose={() => router.closeOverlay()}
      />
    </div>
  );
}
