import matplotlib.pyplot as plt
import matplotlib.patches as mpatches

fig, ax = plt.subplots(figsize=(8, 6))

def draw_box(ax, x, y, text, color):
    box = mpatches.FancyBboxPatch((x, y), 2.5, 1.0, 
                                  boxstyle="round,pad=0.2", 
                                  ec="black", fc=color, lw=1.5)
    ax.add_patch(box)
    ax.text(x+1.25, y+0.5, text, ha="center", va="center", fontsize=10, 
            fontname="Arial", fontweight="bold")

# Draw the tree
draw_box(ax, 3.5, 7, "Turnover Ratio > 8.5?", "#ffe599")

# Left side
ax.annotate("", xy=(2.5, 6), xytext=(4.75, 7), arrowprops=dict(arrowstyle="->", lw=1.5))
ax.text(3.3, 6.6, "Yes", fontsize=10, fontweight="bold")

draw_box(ax, 1, 5, "Stockout Count <= 2?", "#ffe599")

ax.annotate("", xy=(1.0, 4), xytext=(2.25, 5), arrowprops=dict(arrowstyle="->", lw=1.5))
ax.text(1.3, 4.6, "Yes", fontsize=10, fontweight="bold")
draw_box(ax, -0.5, 3, "High KPI (85% Conf)", "#d9ead3")

ax.annotate("", xy=(3.5, 4), xytext=(2.25, 5), arrowprops=dict(arrowstyle="->", lw=1.5))
ax.text(3.1, 4.6, "No", fontsize=10, fontweight="bold")
draw_box(ax, 2.5, 3, "Medium KPI", "#f4cccc")

# Right side
ax.annotate("", xy=(7.0, 6), xytext=(4.75, 7), arrowprops=dict(arrowstyle="->", lw=1.5))
ax.text(6.0, 6.6, "No", fontsize=10, fontweight="bold")

draw_box(ax, 6, 5, "Layout Eff < 0.4 \n& Picking > 120s?", "#ffe599")

ax.annotate("", xy=(5.5, 4), xytext=(7.25, 5), arrowprops=dict(arrowstyle="->", lw=1.5))
ax.text(6.0, 4.6, "Yes", fontsize=10, fontweight="bold")
draw_box(ax, 4.5, 3, "Low KPI (92% Conf)", "#f4cccc")

ax.annotate("", xy=(8.5, 4), xytext=(7.25, 5), arrowprops=dict(arrowstyle="->", lw=1.5))
ax.text(8.2, 4.6, "No", fontsize=10, fontweight="bold")
draw_box(ax, 7.5, 3, "Medium KPI", "#d9ead3")


ax.set_xlim(-1, 11)
ax.set_ylim(2, 9)
ax.axis("off")
plt.title("Decision Tree: KPI Predictor Rules", fontsize=14, fontweight="bold")

plt.savefig("decision_tree.png", dpi=300)
print("Saved decision_tree.png")
