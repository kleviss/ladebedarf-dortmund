// Factor-model inputs bundled with the app (≈ 40 kB): see docs/factor-model.md.
import destinationsCsv from '../../public/data/model/destinations.csv?raw';
import factorsCsv from '../../public/data/model/factors.csv?raw';
import parametersJson from '../../public/data/model/parameters.json';
import { defaultFactorParams, parseCsv, toDestination, toFactorDistrict, type ParameterSpec } from './factors';

export const factorDistricts = parseCsv(factorsCsv).map(toFactorDistrict);
export const factorDestinations = parseCsv(destinationsCsv).map(toDestination);
export const factorDefaults = defaultFactorParams(parametersJson as unknown as { parameters: ParameterSpec[] });
