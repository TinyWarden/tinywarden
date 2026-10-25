import type {PackageMetadata} from './package-types';
export function usesResourceCollections(metadata:PackageMetadata){
 return metadata.manifest.sdk===2||metadata.manifest.sdk===3&&metadata.manifest.resource_collections!==undefined;
}
export const sdk3Feature='skill_packages.sdk3.v1';
