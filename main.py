import numpy as np
import matplotlib.pyplot as plt
from matplotlib.widgets import Slider


# ============================================================
# CONFIGURAÇÃO DH
# ============================================================

dh_definitions = [
  { "name": "J1", "theta": 0, "d": 229.4,   "a": 0.0, "alpha": 90,  "min": -180, "max": 180 },
  { "name": "J2", "theta": 0, "d": 0.0, "a": 229.4, "alpha": 0,  "min": -180, "max": 180 },
  { "name": "J3", "theta": 0, "d": 0.0, "a": 250.2, "alpha": 0,  "min": -180, "max": 180 },
  { "name": "J4", "theta": 0, "d": 0.0, "a": 252.5, "alpha": 90, "min": -180, "max": 180 },
  { "name": "J5", "theta": 0, "d": 0.0, "a": 158.9, "alpha": 90, "min": -180, "max": 180 },
  { "name": "J6", "theta": 0, "d": 0.0,("a"): 152.0, "alpha": 90, "min": -180,("max"): 180 },
]


# ============================================================
# MATRIZ DH PADRÃO
# ============================================================

def dh_matrix(theta, d, a, alpha):

    theta = np.radians(theta)
    alpha = np.radians(alpha)

    ct = np.cos(theta)
    st = np.sin(theta)

    ca = np.cos(alpha)
    sa = np.sin(alpha)

    return np.array([
        [ct, -st * ca,  st * sa, a * ct],
        [st,  ct * ca, -ct * sa, a * st],
        [0,        sa,       ca,      d],
        [0,         0,        0,      1]
    ])


# ============================================================
# CALCULA TODOS OS FRAMES
# ============================================================

def calculate_frames(joint_angles):

    frames = []

    # Frame da base
    T = np.eye(4)
    frames.append(T.copy())

    for i, dh in enumerate(dh_definitions):

        theta = joint_angles[i]

        A = dh_matrix(
            theta,
            dh["d"],
            dh["a"],
            dh["alpha"]
        )

        T = T @ A

        frames.append(T.copy())

    return frames


# ============================================================
# DESENHO DOS FRAMES
# ============================================================

def draw_frame(ax, T, name, size=50):

    origin = T[:3, 3]

    x_axis = T[:3, 0]
    y_axis = T[:3, 1]
    z_axis = T[:3, 2]

    # X
    ax.quiver(
        origin[0],
        origin[1],
        origin[2],
        x_axis[0],
        x_axis[1],
        x_axis[2],
        length=size,
        color="red",
        arrow_length_ratio=0.15
    )

    # Y
    ax.quiver(
        origin[0],
        origin[1],
        origin[2],
        y_axis[0],
        y_axis[1],
        y_axis[2],
        length=size,
        color="green",
        arrow_length_ratio=0.15
    )

    # Z
    ax.quiver(
        origin[0],
        origin[1],
        origin[2],
        z_axis[0],
        z_axis[1],
        z_axis[2],
        length=size,
        color="blue",
        arrow_length_ratio=0.15
    )

    # Nome do frame
    ax.text(
        origin[0],
        origin[1],
        origin[2],
        f"  {name}",
        fontsize=10,
        fontweight="bold"
    )


# ============================================================
# DESENHA O ROBÔ
# ============================================================

def draw_robot(ax, joint_angles):

    ax.clear()

    frames = calculate_frames(joint_angles)

    # --------------------------------------------------------
    # POSIÇÕES DAS JUNTAS
    # --------------------------------------------------------

    positions = np.array([
        T[:3, 3]
        for T in frames
    ])

    # --------------------------------------------------------
    # DESENHA OS ELos
    # --------------------------------------------------------

    ax.plot(
        positions[:, 0],
        positions[:, 1],
        positions[:, 2],
        "-o",
        linewidth=3,
        markersize=7
    )

    # --------------------------------------------------------
    # DESENHA OS FRAMES
    # --------------------------------------------------------

    # Frame 0 = base
    draw_frame(
        ax,
        frames[0],
        "Base",
        size=60
    )

    # J1 ... J6
    for i in range(1, len(frames)):

        draw_frame(
            ax,
            frames[i],
            f"J{i}",
            size=60
        )

    # --------------------------------------------------------
    # LABEL DAS JUNTAS
    # --------------------------------------------------------

    for i, position in enumerate(positions):

        ax.text(
            position[0],
            position[1],
            position[2] + 20,
            f"J{i}",
            fontsize=9
        )

    # --------------------------------------------------------
    # CONFIGURAÇÃO DOS EIXOS
    # --------------------------------------------------------

    ax.set_xlabel("X")
    ax.set_ylabel("Y")
    ax.set_zlabel("Z")

    ax.set_title(
        "Visualizador Denavit-Hartenberg"
    )

    ax.grid(True)

    # Mantém escala semelhante nos três eixos
    max_range = np.ptp(positions, axis=0).max()

    if max_range < 1:
        max_range = 500

    center = positions.mean(axis=0)

    ax.set_xlim(
        center[0] - max_range,
        center[0] + max_range
    )

    ax.set_ylim(
        center[1] - max_range,
        center[1] + max_range
    )

    ax.set_zlim(
        center[2] - max_range,
        center[2] + max_range
    )

    ax.set_box_aspect([1, 1, 1])


# ============================================================
# JANELA
# ============================================================

fig = plt.figure(figsize=(11, 8))

ax = fig.add_subplot(
    111,
    projection="3d"
)

# Ângulos iniciais
joint_angles = np.zeros(6)

draw_robot(
    ax,
    joint_angles
)


# ============================================================
# SLIDERS
# ============================================================

sliders = []

# espaço inferior para os sliders
plt.subplots_adjust(
    bottom=0.30
)

for i, dh in enumerate(dh_definitions):

    y = 0.24 - i * 0.035

    slider_ax = plt.axes([
        0.25,
        y,
        0.60,
        0.025
    ])

    slider = Slider(
        slider_ax,
        dh["name"],
        dh["min"],
        dh["max"],
        valinit=0,
        valstep=1
    )

    sliders.append(slider)


# ============================================================
# ATUALIZAÇÃO
# ============================================================

def update(val):

    angles = [
        slider.val
        for slider in sliders
    ]

    draw_robot(
        ax,
        angles
    )

    fig.canvas.draw_idle()


for slider in sliders:
    slider.on_changed(update)


# ============================================================
# MOSTRA
# ============================================================

plt.show()