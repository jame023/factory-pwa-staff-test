import { hideActionPopup, showActionPopup } from "./action-popup.js?v=1.3.186";

export function showToast(message, tone = "info") {
  hideActionPopup();
  showActionPopup(message, {
    tone: tone === "success" || tone === "error" ? tone : "info",
    timeout: 3200
  });
}
