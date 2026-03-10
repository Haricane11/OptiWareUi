import matplotlib.pyplot as plt
import matplotlib.patches as mpatches

fig, ax = plt.subplots(figsize=(6, 8))

def draw_layer(ax, x, y, text, color):
    box = mpatches.Rectangle((x, y), 3, 0.8, ec="black", fc=color, lw=1.5)
    ax.add_patch(box)
    ax.text(x+1.5, y+0.4, text, ha="center", va="center", fontsize=11, fontname="Arial", fontweight="bold")

# Input
ax.text(3.5, 8.5, "Input x", ha="center", va="center", fontsize=12, fontweight="bold")
ax.annotate("", xy=(3.5, 7.8), xytext=(3.5, 8.3), arrowprops=dict(arrowstyle="->", lw=2))

# Layers
draw_layer(ax, 2, 7, "Weight layer", "#cfe2f3")
ax.annotate("", xy=(3.5, 6.2), xytext=(3.5, 7.0), arrowprops=dict(arrowstyle="->", lw=2))

draw_layer(ax, 2, 5.4, "ReLU", "#cfe2f3")
ax.annotate("", xy=(3.5, 4.6), xytext=(3.5, 5.4), arrowprops=dict(arrowstyle="->", lw=2))

draw_layer(ax, 2, 3.8, "Weight layer", "#cfe2f3")

# Combine/add
circle = plt.Circle((3.5, 2.8), 0.3, color='#ea9999', ec="black", lw=1.5)
ax.add_patch(circle)
ax.text(3.5, 2.8, "+", ha="center", va="center", fontsize=16, fontweight="bold")

ax.annotate("", xy=(3.5, 3.1), xytext=(3.5, 3.8), arrowprops=dict(arrowstyle="->", lw=2))
ax.text(3.7, 3.45, "F(x)", fontsize=12)

# Skip connection
ax.annotate("", xy=(3.1, 2.8), xytext=(3.5, 8.0), 
            arrowprops=dict(arrowstyle="->", lw=2.5, connectionstyle="bar,fraction=-0.3", color="#38761d"))

ax.text(1.5, 5.5, "identity x", fontsize=12, fontstyle="italic", color="#38761d")

# Output
ax.annotate("", xy=(3.5, 1.8), xytext=(3.5, 2.5), arrowprops=dict(arrowstyle="->", lw=2))
draw_layer(ax, 2, 1.0, "ReLU", "#cfe2f3")

ax.annotate("", xy=(3.5, 0.4), xytext=(3.5, 1.0), arrowprops=dict(arrowstyle="->", lw=2))
ax.text(3.5, 0.2, "F(x) + x", ha="center", va="center", fontsize=12, fontweight="bold")

ax.set_xlim(-1, 8)
ax.set_ylim(0, 9)
ax.axis("off")
plt.title("ResNet: Residual Learning Building Block", fontsize=14, fontweight="bold")

plt.savefig("resnet_block.png", dpi=300)
print("Saved resnet_block.png")
