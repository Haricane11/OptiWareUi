"use client";

import { useState, useMemo, useEffect } from "react";
import { 
  Table, 
  TableHeader, 
  TableRow, 
  TableHead, 
  TableBody, 
  TableCell 
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Box, CheckCircle2, AlertTriangle, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ShelfUsageDashboard({ zones, shelves }) {
  const [activeZoneId, setActiveZoneId] = useState(zones[0]?.id);
  const [selectedAisle, setSelectedAisle] = useState("All");

  useEffect(() => {
    setSelectedAisle("All");
  }, [activeZoneId]);

  const processedZones = useMemo(() => {
    return zones.map(zone => {
      const zoneShelves = shelves.filter(s => s.zone_id === zone.id);
      
      const totalVolume = zoneShelves.reduce((acc, s) => {
        const vol = s.width * s.depth * s.height || 0;
        return acc + vol;
      }, 0);

      const usedVolume = zoneShelves.reduce((acc, s) => {
        // Fallback: available_volume is total - used, so used = total - available
        const total = s.width * s.depth * s.height || 0;
        const avail = s.available_volume != null ? parseFloat(s.available_volume) : total;
        const used = s.used_volume != null ? parseFloat(s.used_volume) : (total - avail);
        return acc + Math.max(0, used);
      }, 0);

      const usedPct = totalVolume > 0 ? (usedVolume / totalVolume) * 100 : 0;

      return {
        ...zone,
        shelves: zoneShelves,
        totalVolume,
        usedVolume,
        usedPct,
        shelfCount: zoneShelves.length
      };
    });
  }, [zones, shelves]);

  const activeZone = processedZones.find(z => z.id === activeZoneId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Warehouse Storage Analytics</h2>
          <p className="text-muted-foreground">Monitor shelf utilization and available capacity across zones.</p>
        </div>
        <div className="flex gap-4">
          <Card className="px-4 py-2 bg-primary/5 border-primary/20">
            <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total Shelves</div>
            <div className="text-xl font-bold">{shelves.length}</div>
          </Card>
          <Card className="px-4 py-2 bg-green-500/5 border-green-500/20">
            <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Active Zones</div>
            <div className="text-xl font-bold text-green-600">{zones.length}</div>
          </Card>
        </div>
      </div>

      <Tabs value={activeZoneId} onValueChange={setActiveZoneId} className="w-full">
        <div className="flex items-center justify-between mb-4 border-b">
          <TabsList className="bg-transparent h-auto p-0 gap-8">
            {processedZones.map(zone => (
              <TabsTrigger
                key={zone.id}
                value={zone.id}
                className={cn(
                  "relative h-12 rounded-none border-b-2 border-b-transparent bg-transparent px-2 pb-3 pt-2 font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-b-primary data-[state=active]:text-foreground data-[state=active]:shadow-none",
                )}
              >
                <div className="flex items-center gap-2">
                  <div 
                    className="w-2 h-2 rounded-full" 
                    style={{ backgroundColor: zone.color || '#ccc' }} 
                  />
                  {zone.zone_name}
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                    {zone.shelfCount}
                  </Badge>
                </div>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {processedZones.map(zone => (
          <TabsContent key={zone.id} value={zone.id} className="mt-0 focus-visible:outline-none focus-visible:ring-0">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <Card>
                <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-sm font-medium">Zone Utilization</CardTitle>
                  <Layers className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="py-3 px-4">
                  <div className="text-2xl font-bold">{zone.usedPct.toFixed(1)}%</div>
                  <Progress value={zone.usedPct} className="h-2 mt-2" />
                  <p className="text-xs text-muted-foreground mt-2">
                    {zone.usedVolume.toFixed(2)} m³ used of {zone.totalVolume.toFixed(2)} m³
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-sm font-medium">Available Capacity</CardTitle>
                  <Box className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="py-3 px-4">
                  <div className="text-2xl font-bold text-green-600">
                    {(100 - zone.usedPct).toFixed(1)}%
                  </div>
                  <div className="flex gap-1 mt-2">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <div 
                        key={i} 
                        className={cn(
                          "h-2 flex-1 rounded-sm",
                          i < (100 - zone.usedPct) / 10 ? "bg-green-500" : "bg-muted"
                        )}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {(zone.totalVolume - zone.usedVolume).toFixed(2)} m³ free for storage
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-sm font-medium">Zone Health</CardTitle>
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent className="py-3 px-4">
                  <div className="text-2xl font-bold">Optimal</div>
                  <div className="flex items-center gap-1 mt-2 text-xs text-green-600 font-medium">
                    <CheckCircle2 className="h-3 w-3" /> All systems normal
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Balanced load distribution across shelves.
                  </p>
                </CardContent>
              </Card>
            </div>
            
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Filter Aisle:</span>
                <div className="flex flex-wrap gap-2">
                  <Badge 
                    variant={selectedAisle === "All" ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => setSelectedAisle("All")}
                  >
                    All Aisles
                  </Badge>
                  {[...new Set(zone.shelves.map(s => s.aisle_num))].sort((a,b) => a-b).map(aisle => (
                    <Badge 
                      key={aisle}
                      variant={selectedAisle === aisle ? "default" : "outline"}
                      className="cursor-pointer font-mono"
                      onClick={() => setSelectedAisle(aisle)}
                    >
                      Aisle {aisle}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="text-xs text-muted-foreground italic">
                Sorted by highest utilization first
              </div>
            </div>

            <div className="rounded-md border bg-card shadow-sm overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="font-semibold">Shelf Code</TableHead>
                    <TableHead className="font-semibold">Type</TableHead>
                    <TableHead className="font-semibold">Volume Usage (m³)</TableHead>
                    <TableHead className="font-semibold">Used %</TableHead>
                    <TableHead className="font-semibold">Available %</TableHead>
                    <TableHead className="font-semibold text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {zone.shelves.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                        No shelves found in this zone.
                      </TableCell>
                    </TableRow>
                  ) : (
                    zone.shelves
                      .filter(s => selectedAisle === "All" || s.aisle_num === selectedAisle)
                      .map(s => {
                        const total = s.width * s.depth * s.height || 0.001;
                        const avail = s.available_volume != null ? parseFloat(s.available_volume) : total;
                        const used = s.used_volume != null ? parseFloat(s.used_volume) : Math.max(0, total - avail);
                        return { ...s, _usedPct: (used / total) * 100, _used: used, _total: total, _avail: avail };
                      })
                      .sort((a, b) => b._usedPct - a._usedPct)
                      .map(shelf => {
                        const usedPct = shelf._usedPct;
                        const availPct = 100 - usedPct;
                        const used = shelf._used;
                        const total = shelf._total;

                        return (
                          <TableRow key={shelf.id} className="hover:bg-muted/30 transition-colors">
                            <TableCell className="font-mono font-medium">
                              <div className="flex flex-col">
                                <span>{shelf.shelf_code}</span>
                                <span className="text-[10px] text-muted-foreground font-sans">Aisle {shelf.aisle_num}</span>
                              </div>
                            </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-tight py-0">
                              {shelf.shelf_type?.replace(/_/g, ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="text-sm">{used.toFixed(3)} / {total.toFixed(3)}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                                <div 
                                  className={cn(
                                    "h-full rounded-full transition-all",
                                    usedPct > 90 ? "bg-red-500" : usedPct > 70 ? "bg-amber-500" : "bg-primary"
                                  )}
                                  style={{ width: `${usedPct}%` }}
                                />
                              </div>
                              <span className="text-xs font-medium w-10">{usedPct.toFixed(1)}%</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs font-medium text-green-600">
                              {availPct.toFixed(1)}%
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            {usedPct > 95 ? (
                              <Badge variant="destructive" className="animate-pulse">Full</Badge>
                            ) : usedPct > 80 ? (
                              <Badge variant="warning" className="bg-amber-100 text-amber-800 border-amber-200">Near Limit</Badge>
                            ) : (
                              <Badge variant="success" className="bg-green-100 text-green-800 border-green-200 uppercase">Available</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
