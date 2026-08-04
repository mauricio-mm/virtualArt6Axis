export function formatNumber(value) {
  if (Math.abs(value) < 0.0005) {
    return "0.000";
  }

  return value.toFixed(3);
}

export function formatAngle(value) {
  return `${value.toFixed(1)} deg`;
}

export function formatPosition(vector) {
  return `${formatNumber(vector.x)}, ${formatNumber(vector.y)}, ${formatNumber(vector.z)}`;
}

export function createCollapsibleSection(panelSelector, toggleSelector) {
  const panel = document.querySelector(panelSelector);
  const toggle = document.querySelector(toggleSelector);
  const icon = toggle.querySelector(".panel-toggle-icon");

  function render() {
    const isCollapsed = panel.classList.contains("is-collapsed");
    toggle.setAttribute("aria-expanded", String(!isCollapsed));
    icon.textContent = isCollapsed ? "+" : "-";
  }

  toggle.addEventListener("click", () => {
    panel.classList.toggle("is-collapsed");
    render();
  });

  render();
}
