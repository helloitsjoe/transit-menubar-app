import MBTA from 'mbta-client';
import routesConfig from '../resources/routes.config.json';
const enabledRoutes = Object.values(routesConfig.enabled);
let mbtaKey;
try {
  mbtaKey = require('../resources/credentials.json').mbtaKey;
} catch (err) {
  console.warn('Missing API key, making call without key...');
}

const PREDICTIONS_LIMIT = 4;

export const fetchData = ({
  routes = enabledRoutes,
  mbta = new MBTA(mbtaKey),
} = {}) => {
  // It would be better to send one request with a list of stops, but parsing
  // the response isn't feasible because data.relationships.stop.data.id
  // is sometimes different from route.stop
  const predictionPromises = Promise.all(
    routes.map(route =>
      mbta.fetchPredictions({
        stop: route.stop,
        direction_id: route.direction,
        sort: 'arrival_time',
        include: ['stop', 'route'],
      })
    )
  );

  return predictionPromises
    .then(predictions => {
      console.log(`Fetched live data`);

      const allPreds = predictions.map((rawPred, i) => {
        if (!rawPred) {
          throw new Error('No predictions');
        }

        const { waitStart, waitLength, route, morning, customName } = routes[i];
        const { selectArrivals, selectIncluded } = mbta;

        // TODO: Figure out some good defaults to fall back to,
        // in case of missing data/included info

        // Filter out other routes for the same stop
        const routeData = rawPred.data.filter(
          ea => !route || ea.relationships.route.data.id === route.toString()
        );
        const pred = { data: routeData };
        const arrivals = selectArrivals(pred, { convertTo: 'min' });
        const stopName = selectIncluded(rawPred, 'stop')[0].attributes.name;
        const routeAttrs = selectIncluded(rawPred, 'route')[0].attributes;
        const directionIdx =
          routeData.length > 0 && routeData[0].attributes.direction_id;

        const {
          direction_destinations,
          direction_names,
          color,
          text_color: textColor,
        } = routeAttrs;

        // Either set direction as the destination or
        // generic Inbound/Outbound, or fall back to empty string
        const direction =
          direction_destinations[directionIdx] ||
          direction_names[directionIdx] ||
          '';

        const arrivalMins = arrivals
          .filter(min => min >= 1 && min < 60)
          .slice(0, PREDICTIONS_LIMIT);

        const isWalkable = arrivalMins.some(
          mins => mins >= waitStart && mins <= waitStart + waitLength
        );

        const id = i;

        return {
          id,
          color,
          morning,
          stopName,
          direction,
          textColor,
          isWalkable,
          customName,
          arrivalMins,
          // for debugging client side
          _pastArrivalMins: arrivals.filter(min => min <= 2),
          _predictions: rawPred,
          _filtered: routeData,
        };
      });

      return {
        morning: allPreds.filter(pred => pred.morning),
        evening: allPreds.filter(pred => !pred.morning),
      };
    })
    .catch(e => {
      console.error('Error during fetch:', e);
      const { message, stack } = e;
      return { error: { message, stack } };
    });
};
