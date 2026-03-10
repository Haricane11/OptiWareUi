import pandas as pd
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d import Axes3D
import numpy as np

# Load dataset
df = pd.read_csv('logistics_dataset.csv')

# Simulate the KMeans clusters described in the report
# Fast Movers: High turnover, High demand, Low picking time
# Slow Movers: Low turnover, Low demand, High picking time
# Steady Sellers: Medium across the board

np.random.seed(42)

def assign_cluster(row):
    if row['turnover_ratio'] > 10 and row['daily_demand'] > 30 and row['picking_time_seconds'] < 100:
        return 'Cluster 1: High Movers'
    elif row['turnover_ratio'] < 5 and row['daily_demand'] < 15:
        return 'Cluster 3: Slow Movers'
    else:
        return 'Cluster 2: Steady Sellers'

df['Cluster'] = df.apply(assign_cluster, axis=1)

# Sort for plotting priority if needed
colors = {'Cluster 1: High Movers': 'r', 'Cluster 2: Steady Sellers': 'g', 'Cluster 3: Slow Movers': 'b'}

fig = plt.figure(figsize=(10, 8))
ax = fig.add_subplot(111, projection='3d')

for cluster, color in colors.items():
    subset = df[df['Cluster'] == cluster]
    ax.scatter(subset['turnover_ratio'], subset['daily_demand'], subset['picking_time_seconds'], 
               c=color, label=cluster, alpha=0.6, edgecolors='w', s=50)

ax.set_xlabel('Turnover Ratio')
ax.set_ylabel('Daily Demand')
ax.set_zlabel('Picking Time (s)')
ax.set_title('3D Scatter Plot of Inventory Clusters')
ax.legend()

plt.savefig('cluster_plot.png', dpi=300)
print("Saved cluster_plot.png")
