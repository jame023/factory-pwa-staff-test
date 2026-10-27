import { escapeHtml } from "../js/utils.js?v=1.3.186";

let activeConfirmation = null;

export function confirmAction({ title, message, confirmLabel = "ยืนยัน", danger = false }) {
  if (activeConfirmation) return Promise.resolve(false);
  return new Promise(resolve => {
    const root = document.createElement("div");
    root.className = "modal-backdrop";
    activeConfirmation = root;
    root.innerHTML = '<section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="confirm-title">' +
      '<h2 id="confirm-title">' + escapeHtml(title) + "</h2>" +
      "<p>" + escapeHtml(message) + '</p><div class="modal-actions">' +
      '<button type="button" class="button" data-choice="cancel">ยกเลิก</button>' +
      '<button type="button" class="button ' + (danger ? "button-danger" : "button-primary") +
      '" data-choice="confirm">' + escapeHtml(confirmLabel) + "</button></div></section>";
    const finish = value => { if (activeConfirmation !== root) return; activeConfirmation = null; root.remove(); resolve(value); };
    root.addEventListener("click", event => {
      const choice = event.target.closest("[data-choice]")?.dataset.choice;
      if (choice) finish(choice === "confirm");
      else if (event.target === root) finish(false);
    });
    document.body.append(root);
    root.querySelector("[data-choice=confirm]").focus();
  });
}
