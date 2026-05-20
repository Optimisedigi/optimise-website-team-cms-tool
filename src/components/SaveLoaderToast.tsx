'use client'

import React from 'react'

/**
 * Global save loader CSS injection.
 * Injects styles that detect Payload's save button loading state via CSS
 * and show rocket animation + toast automatically.
 * 
 * Note: Full toast notification requires JS detection which is done
 * via a MutationObserver injected here.
 */
const SaveLoaderToast: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <>
      {children}
      <SaveLoaderScript />
    </>
  )
}

const SaveLoaderScript: React.FC = () => {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
          (function() {
            // Inject styles
            var style = document.createElement('style');
            style.textContent = \`
              /* Rocket animation when save button is loading */
              .od-save-overlay {
                position: fixed;
                bottom: 24px;
                right: 24px;
                z-index: 9999;
                pointer-events: none;
                display: flex;
                align-items: center;
                justify-content: center;
              }
              .od-save-overlay img {
                animation: od-rocket-pulse 0.8s ease-in-out infinite;
              }
              @keyframes od-rocket-pulse {
                0%, 100% { transform: scale(1); opacity: 1; }
                50% { transform: scale(1.15); opacity: 0.8; }
              }
              
              /* Toast styles */
              .od-save-toast {
                position: fixed;
                bottom: 24px;
                right: 24px;
                z-index: 99999;
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 12px 16px;
                color: white;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                font-size: 14px;
                font-weight: 500;
                animation: od-toast-in 0.2s ease-out;
              }
              .od-save-toast.od-toast-success { background: #059669; }
              .od-save-toast.od-toast-error { background: #DC2626; }
              @keyframes od-toast-in {
                from { transform: translateY(20px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
              }
              .od-save-toast-close {
                display: flex;
                align-items: center;
                justify-content: center;
                margin-left: 4px;
                padding: 4px;
                background: transparent;
                border: none;
                color: white;
                opacity: 0.7;
                cursor: pointer;
                border-radius: 4px;
              }
              .od-save-toast-close:hover { opacity: 1; }
            \`;
            document.head.appendChild(style);
            
            // Rocket image HTML
            var rocketHTML = '<div class="od-save-overlay"><img src="/optimise-rocket-logo-black.png" alt="" width="32" height="32"></div>';
            
            // Toast container
            var toastContainer = null;
            
            function showToast(type, message) {
              if (!toastContainer) {
                toastContainer = document.createElement('div');
                toastContainer.className = 'od-save-toast od-toast-' + type;
                toastContainer.innerHTML = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M16.667 5L7.5 14.167 3.333 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg><span>' + message + '</span><button class="od-save-toast-close" onclick="this.parentElement.remove()"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></button>';
                document.body.appendChild(toastContainer);
              }
              
              // Auto-dismiss after 3 seconds
              setTimeout(function() {
                if (toastContainer && toastContainer.parentElement) {
                  toastContainer.remove();
                  toastContainer = null;
                }
              }, 3000);
            }
            
            // Monitor save button state
            var wasLoading = false;
            var overlay = null;
            
            function checkSaveState() {
              var saveBtn = document.querySelector('[id="action-save"]');
              if (saveBtn) {
                var btn = saveBtn;
                var isLoading = btn.disabled || btn.getAttribute('aria-disabled') === 'true' || btn.classList.contains('loading');
                
                if (isLoading && !wasLoading) {
                  // Started saving
                  wasLoading = true;
                  if (!overlay) {
                    overlay = document.createElement('div');
                    overlay.innerHTML = rocketHTML;
                    document.body.appendChild(overlay);
                  }
                } else if (!isLoading && wasLoading) {
                  // Finished saving
                  wasLoading = false;
                  if (overlay) {
                    overlay.remove();
                    overlay = null;
                  }
                  showToast('success', 'Saved successfully');
                }
              }
            }
            
            // Check every 200ms
            setInterval(checkSaveState, 200);
          })();
        `
      }}
    />
  )
}

export default SaveLoaderToast
