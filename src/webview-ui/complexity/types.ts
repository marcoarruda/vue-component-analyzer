export interface DetailItem {
  name: string;
  type?: string;
}

export interface DetailSection {
  title: string;
  emptyLabel: string;
  items: DetailItem[];
}

export interface ComplexityPayload {
  componentName: string;
  componentPath: string;
  badgeAssetUri: string;
  badgeLabel: string;
  sections: Record<string, DetailSection>;
}
