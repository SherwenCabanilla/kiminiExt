  // Checkbox changes -> update preview
  on(elements.feedbackChecklist, 'change', updateFeedbackPreview);
  on(elements.inputStudent, 'input', updateFeedbackPreview);
  on(elements.btnAddFeedbackItem, 'click', addCustomFeedbackItem);
  on(elements.btnCancelFeedbackEdit, 'click', cancelCustomFeedbackEdit);
  on(elements.feedbackChecklist, 'click', (event) => {
    const button = event.target.closest('button[data-feedback-action]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();

    if (button.dataset.feedbackType === 'builtin') {
      if (button.dataset.feedbackAction === 'edit') {
        startBuiltinFeedbackEdit(button.dataset.originalFeedback);
      } else if (button.dataset.feedbackAction === 'delete') {
        deleteBuiltinFeedbackItem(button.dataset.originalFeedback);
      }
      return;
    }

    const index = Number(button.dataset.feedbackIndex);
    if (button.dataset.feedbackAction === 'edit') {
      startCustomFeedbackEdit(index);
    } else if (button.dataset.feedbackAction === 'delete') {
      deleteCustomFeedbackItem(index);
    }
  });

  // Copy Feedback
  on(elements.btnCopyFeedback, 'click', copyFeedbackToClipboard);
}
