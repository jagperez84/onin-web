import * as V3 from './otdCalculationServiceV3';

export type OtdComponentDef = Omit<V3.OtdComponentDef,'product_selection_code'> & { product_selection_code?: string | null };
export type OtdRuntimeData = Omit<V3.OtdRuntimeData,'components'> & { components: OtdComponentDef[] };
export type OtdCalculationResult = V3.OtdCalculationResult;
export type OtdConfigurationSnapshot = V3.OtdConfigurationSnapshot;
export type OtdCalculatedComponent = V3.OtdCalculatedComponent;
export type OtdModel = V3.OtdModel;
export type OtdSelection = V3.OtdSelection;
export type OtdSelectionOption = V3.OtdSelectionOption;
export type OtdVariable = V3.OtdVariable;
export type OtdDimensionDef = V3.OtdDimensionDef;
export type OtdScale = V3.OtdScale;
export type OtdSnapshotComponent = V3.OtdSnapshotComponent;

export async function loadOtdRuntimeData(id:number):Promise<OtdRuntimeData>{ return V3.loadOtdRuntimeData(id) as Promise<OtdRuntimeData>; }
export async function fetchProductForOtdComponent(id:number){ return V3.fetchProductForOtdComponent(id); }
export function calculateOtdRuntime(data:OtdRuntimeData,values:Record<string,string|number|boolean|null>):OtdCalculationResult{ return V3.calculateOtdRuntime(data as V3.OtdRuntimeData,values); }
export function buildOtdConfigurationSnapshot(data:OtdRuntimeData,result:OtdCalculationResult,notes?:string):OtdConfigurationSnapshot{ return V3.buildOtdConfigurationSnapshot(data as V3.OtdRuntimeData,result,notes); }
