export const operationModes = Object.freeze({
  receive: "receive",
  send: "send",
});

export function createOperationModeControl({ onChange } = {}) {
  const control = document.querySelector("#operation-mode");
  const buttons = [...control.querySelectorAll("[data-operation-mode]")];
  let mode = operationModes.receive;

  function render() {
    buttons.forEach((button) => {
      const isActive = button.dataset.operationMode === mode;

      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  }

  function setMode(nextMode) {
    if (!Object.values(operationModes).includes(nextMode) || nextMode === mode) {
      return;
    }

    mode = nextMode;
    render();
    onChange?.(mode);
  }

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      setMode(button.dataset.operationMode);
    });
  });

  render();

  return {
    getMode() {
      return mode;
    },
    setMode,
  };
}
