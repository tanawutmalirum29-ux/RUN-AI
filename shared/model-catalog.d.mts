export interface LocalModel {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly vramMB: number;
  readonly family: string;
  readonly style: string;
}
export interface CloudModel {
  readonly id: string;
  readonly label: string;
  readonly provider: 'bedrock' | 'openrouter';
  readonly modelId: string;
  readonly supportsImage: boolean;
  readonly description: string;
  readonly style: string;
  readonly tier?: 'frontier' | 'native';
}
export declare const DEFAULT_LOCAL_MODEL: string;
export declare const DEFAULT_CLOUD_MODEL: string;
export declare const LOCAL_MODELS: ReadonlyArray<LocalModel>;
export declare const CLOUD_MODELS: ReadonlyArray<CloudModel>;
export declare function getLocalModel(id: string): LocalModel | undefined;
export declare function selectCloudModel(id?: string): CloudModel;
export declare function cloudModelAvailable(model: CloudModel | undefined, status: { configured?: boolean; openrouterEnabled?: boolean } | null | undefined): boolean;
