// Factor-model inputs bundled with the app (≈ 40 kB): see docs/factor-model.md.
import destinationsCsv from '../data/model/destinations.csv?raw';
import factorsCsv from '../data/model/factors.csv?raw';
import parametersJson from '../data/model/parameters.json';
import { defaultFactorParams, parseCsv, toDestination, toFactorDistrict, type ParameterSpec } from './factors';

export const factorDistricts = parseCsv(factorsCsv).map(toFactorDistrict);
export const factorDestinations = parseCsv(destinationsCsv).map(toDestination);
export const factorSpecs = (parametersJson as unknown as { parameters: ParameterSpec[] }).parameters;
export const factorDefaults = defaultFactorParams({ parameters: factorSpecs });
