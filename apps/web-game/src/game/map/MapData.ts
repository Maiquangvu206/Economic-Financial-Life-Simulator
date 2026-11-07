export type ZoneType =
  'residential' | 'commercial' | 'industrial' | 'civic' | 'port' | 'slum' | 'water';

export interface MapNode {
  id: string;
  x: number;
  y: number;
  zoneType: ZoneType;
  name: string;
}

export interface MapRoad {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  type: 'arterial' | 'collector' | 'local';
}

export interface MapProperty {
  id: string;
  nodeId: string;
  ownerId: string | null;
  type: 'apartment' | 'house' | 'office' | 'warehouse' | 'port_berth';
  status: 'unowned' | 'owned' | 'listed' | 'auction';
  valueMinor: number;
}

export interface MapData {
  nodes: MapNode[];
  roads: MapRoad[];
  properties: MapProperty[];
}
