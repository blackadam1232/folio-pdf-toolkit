import React, { useState } from "react";
import { ToolId } from "./types";
import { getToolById } from "./lib/toolRegistry";
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
import { PrivacyModal, HelpModal } from "./components/Modals";
import "./style.css";

export default function App() {
  const [currentView, setCurrentView] = useState<"home" | ToolId>("home");
  const [isPrivacyOpen, setIsPrivacyOpen] = useState<boolean>(false);
  const [isHelpOpen, setIsHelpOpen] = useState<boolean>(false);

  const activeTool = currentView !== "home" ? getToolById(currentView) : undefined;

  const navigateTo = (view: "home" | ToolId) => {
    setCurrentView(view);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="folio-app">
      {/* Universal Paper Studio Header */}
      <Header
        currentView={currentView}
        onNavigate={navigateTo}
        onOpenPrivacy={() => setIsPrivacyOpen(true)}
        onOpenHelp={() => setIsHelpOpen(true)}
        toolTitle={activeTool?.title}
      />

      {/* Main View Router */}
      <main className="folio-main-content">
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
      </main>

      {/* Universal Paper Studio Footer */}
      <Footer
        onOpenPrivacy={() => setIsPrivacyOpen(true)}
        onOpenHelp={() => setIsHelpOpen(true)}
        onNavigateHome={() => navigateTo("home")}
      />

      {/* Global Modals */}
      <PrivacyModal
        isOpen={isPrivacyOpen}
        onClose={() => setIsPrivacyOpen(false)}
      />

      <HelpModal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
      />
    </div>
  );
}
