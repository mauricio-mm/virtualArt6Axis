import numpy as np
import matplotlib.pyplot as plt
from matplotlib.widgets import Slider, Button


# ============================================================
# SISTEMA DE COORDENADAS
# ============================================================
#
# I = X = vermelho
# J = Y = verde
# W = Z = azul
#
# Eixos de rotação definidos por você:
#
# J1 = W+
# J2 = I+
# J3 = I+
# J4 = W+
# J5 = I+
# J6 = W+
#
# ============================================================


I = np.array([1.0, 0.0, 0.0])
J = np.array([0.0, 1.0, 0.0])
W = np.array([0.0, 0.0, 1.0])


# ============================================================
# EIXO DE ROTAÇÃO DE CADA JUNTA
# ============================================================

joint_axes = [
    W,  # J1
    I,  # J2
    I,  # J3
    W,  # J4
    I,  # J5
    W   # J6
]


joint_axis_names = [
    "W+",
    "I+",
    "I+",
    "W+",
    "I+",
    "W+"
]


# ============================================================
# DISTÂNCIA / POSIÇÃO ENTRE AS JUNTAS NA POSIÇÃO ZERO
# ============================================================
#
# Aqui J1 é a origem.
#
# J1 -> J2 = 229.4
# J2 -> J3 = 250.2
# J3 -> J4 = 252.5
# J4 -> J5 = 158.9
# J5 -> J6 = 152.0
#
# IMPORTANTE:
#
# J3 -> J4 está em I+
#
# portanto:
#
# J3 e J4 permanecem na mesma altura W
#
# ============================================================

link_offsets = [
    np.array([0.0,   0.0, 229.4]),  # J1 -> J2
    np.array([250.2, 0.0,   0.0]),  # J2 -> J3

    # J3 -> J4
    # MESMA ALTURA
    np.array([252.5, 0.0,   0.0]),

    np.array([0.0,   0.0, 158.9]),  # J4 -> J5
    np.array([152.0, 0.0,   0.0])   # J5 -> J6
]


# ============================================================
# MATRIZ DE ROTAÇÃO EM TORNO DE UM EIXO
# Rodrigues
# ============================================================

def rotation_matrix(axis, angle_degrees):

    axis = np.asarray(axis, dtype=float)

    axis = axis / np.linalg.norm(axis)

    angle = np.radians(angle_degrees)

    x = axis[0]
    y = axis[1]
    z = axis[2]

    c = np.cos(angle)
    s = np.sin(angle)

    C = 1 - c

    return np.array([
        [
            c + x*x*C,
            x*y*C - z*s,
            x*z*C + y*s
        ],

        [
            y*x*C + z*s,
            c + y*y*C,
            y*z*C - x*s
        ],

        [
            z*x*C - y*s,
            z*y*C + x*s,
            c + z*z*C
        ]
    ])


# ============================================================
# MATRIZ HOMOGÊNEA DE ROTAÇÃO
# ============================================================

def homogeneous_rotation(axis, angle):

    T = np.eye(4)

    T[:3, :3] = rotation_matrix(
        axis,
        angle
    )

    return T


# ============================================================
# MATRIZ HOMOGÊNEA DE TRANSLAÇÃO
# ============================================================

def homogeneous_translation(vector):

    T = np.eye(4)

    T[:3, 3] = vector

    return T


# ============================================================
# CINEMÁTICA DIRETA
# ============================================================

def forward_kinematics(angles):

    transforms_before_rotation = []
    transforms_after_rotation = []

    T = np.eye(4)

    for i in range(6):

        # ----------------------------------------------------
        # Estamos exatamente no centro da junta
        # antes da rotação
        # ----------------------------------------------------

        transforms_before_rotation.append(
            T.copy()
        )

        # ----------------------------------------------------
        # Rotação da junta
        # ----------------------------------------------------

        R = homogeneous_rotation(
            joint_axes[i],
            angles[i]
        )

        T = T @ R

        transforms_after_rotation.append(
            T.copy()
        )

        # ----------------------------------------------------
        # Caminha até a próxima junta
        # ----------------------------------------------------

        if i < 5:

            Translation = homogeneous_translation(
                link_offsets[i]
            )

            T = T @ Translation

    return (
        transforms_before_rotation,
        transforms_after_rotation
    )


# ============================================================
# DESENHAR REFERENCIAL I J W
# ============================================================

def draw_coordinate_frame(ax, T, tamanho=55):

    origem = T[:3, 3]

    R = T[:3, :3]

    eixo_i = R @ I
    eixo_j = R @ J
    eixo_w = R @ W

    # I
    ax.quiver(
        origem[0],
        origem[1],
        origem[2],
        eixo_i[0],
        eixo_i[1],
        eixo_i[2],
        length=tamanho,
        normalize=True,
        color="red",
        linewidth=2
    )

    # J
    ax.quiver(
        origem[0],
        origem[1],
        origem[2],
        eixo_j[0],
        eixo_j[1],
        eixo_j[2],
        length=tamanho,
        normalize=True,
        color="green",
        linewidth=2
    )

    # W
    ax.quiver(
        origem[0],
        origem[1],
        origem[2],
        eixo_w[0],
        eixo_w[1],
        eixo_w[2],
        length=tamanho,
        normalize=True,
        color="blue",
        linewidth=2
    )


# ============================================================
# DESENHAR EIXO REAL DE ROTAÇÃO DA JUNTA
# ============================================================

def draw_joint_axis(ax, T, eixo_local, tamanho=100):

    origem = T[:3, 3]

    R = T[:3, :3]

    eixo_world = R @ eixo_local

    inicio = origem - eixo_world * tamanho / 2

    fim = origem + eixo_world * tamanho / 2

    ax.plot(
        [
            inicio[0],
            fim[0]
        ],
        [
            inicio[1],
            fim[1]
        ],
        [
            inicio[2],
            fim[2]
        ],
        color="black",
        linewidth=4
    )


# ============================================================
# CONFIGURAÇÃO INICIAL
# ============================================================

angles = [
    0,
    0,
    0,
    0,
    0,
    0
]


# ============================================================
# FIGURA
# ============================================================

fig = plt.figure(
    figsize=(13, 10)
)

ax = fig.add_subplot(
    111,
    projection="3d"
)


# Espaço para os sliders

plt.subplots_adjust(
    left=0.08,
    right=0.92,
    top=0.95,
    bottom=0.35
)


# ============================================================
# FUNÇÃO DE DESENHO
# ============================================================

def draw_robot():

    ax.cla()

    (
        transforms_before,
        transforms_after
    ) = forward_kinematics(angles)

    # ========================================================
    # POSIÇÕES DAS JUNTAS
    # ========================================================

    positions = np.array([
        T[:3, 3]
        for T in transforms_before
    ])

    # ========================================================
    # DESENHAR OS ELOS
    # ========================================================

    ax.plot(
        positions[:, 0],
        positions[:, 1],
        positions[:, 2],
        "-o",
        color="black",
        linewidth=5,
        markersize=8
    )

    # ========================================================
    # CADA JUNTA
    # ========================================================

    for i in range(6):

        T_before = transforms_before[i]

        T_after = transforms_after[i]

        p = T_before[:3, 3]

        # Nome
        ax.text(
            p[0],
            p[1],
            p[2] + 18,
            f"J{i + 1}",
            fontsize=11,
            fontweight="bold"
        )

        # eixo de rotação preto
        draw_joint_axis(
            ax,
            T_before,
            joint_axes[i],
            tamanho=110
        )

        # referencial depois da rotação
        draw_coordinate_frame(
            ax,
            T_after,
            tamanho=50
        )

    # ========================================================
    # INFORMAÇÕES DOS ÂNGULOS
    # ========================================================

    texto = ""

    for i in range(6):

        texto += (
            f"J{i + 1}: "
            f"{angles[i]:6.1f}°   "
            f"eixo {joint_axis_names[i]}\n"
        )

    ax.text2D(
        0.02,
        0.98,
        texto,
        transform=ax.transAxes,
        verticalalignment="top",
        fontsize=10
    )

    # ========================================================
    # LEGENDA
    # ========================================================

    ax.plot(
        [],
        [],
        [],
        color="red",
        linewidth=3,
        label="I / X"
    )

    ax.plot(
        [],
        [],
        [],
        color="green",
        linewidth=3,
        label="J / Y"
    )

    ax.plot(
        [],
        [],
        [],
        color="blue",
        linewidth=3,
        label="W / Z"
    )

    ax.plot(
        [],
        [],
        [],
        color="black",
        linewidth=4,
        label="Eixo da junta"
    )

    ax.legend(
        loc="upper right"
    )

    # ========================================================
    # EIXOS
    # ========================================================

    ax.set_xlabel(
        "I / X [mm]"
    )

    ax.set_ylabel(
        "J / Y [mm]"
    )

    ax.set_zlabel(
        "W / Z [mm]"
    )

    ax.set_title(
        "Visualização interativa do robô"
    )

    # ========================================================
    # LIMITES
    # ========================================================

    ax.set_xlim(
        -750,
        750
    )

    ax.set_ylim(
        -750,
        750
    )

    ax.set_zlim(
        -500,
        900
    )

    ax.set_box_aspect(
        [1, 1, 1]
    )

    ax.grid(True)

    # perspectiva
    ax.view_init(
        elev=25,
        azim=-55
    )

    fig.canvas.draw_idle()


# ============================================================
# SLIDERS
# ============================================================

slider_height = 0.025

slider_positions = [
    0.28,
    0.24,
    0.20,
    0.16,
    0.12,
    0.08
]


sliders = []


def create_slider(index):

    slider_ax = plt.axes([
        0.18,
        slider_positions[index],
        0.62,
        slider_height
    ])

    slider = Slider(
        ax=slider_ax,
        label=f"J{index + 1}",
        valmin=0,
        valmax=180,
        valinit=0,
        valstep=1
    )

    sliders.append(slider)


for i in range(6):

    create_slider(i)


# ============================================================
# ATUALIZAR
# ============================================================

def update(_):

    for i in range(6):

        angles[i] = sliders[i].val

    draw_robot()


for slider in sliders:

    slider.on_changed(
        update
    )


# ============================================================
# BOTÃO RESET
# ============================================================

reset_ax = plt.axes([
    0.83,
    0.08,
    0.09,
    0.05
])

reset_button = Button(
    reset_ax,
    "ZERAR"
)


def reset(event):

    for slider in sliders:

        slider.reset()


reset_button.on_clicked(
    reset
)


# ============================================================
# MOSTRAR POSIÇÃO INICIAL NO TERMINAL
# ============================================================

def print_initial_positions():

    transforms_before, _ = forward_kinematics(
        [0, 0, 0, 0, 0, 0]
    )

    print()
    print("=" * 70)
    print("POSIÇÃO DAS JUNTAS EM 0 GRAUS")
    print("=" * 70)

    for i, T in enumerate(transforms_before):

        p = T[:3, 3]

        print(
            f"J{i + 1}: "
            f"I={p[0]:8.2f}   "
            f"J={p[1]:8.2f}   "
            f"W={p[2]:8.2f}"
        )

    print("=" * 70)

    print()
    print("Eixos:")

    for i in range(6):

        print(
            f"J{i + 1}: "
            f"{joint_axis_names[i]}"
        )


# ============================================================
# EXECUTAR
# ============================================================

print_initial_positions()

draw_robot()

plt.show()