const MBTA = require('mbta-client');
const routesConfig = require('../resources/routes.config.js');
const routes = Object.values(routesConfig);
let mbtaKey;
try {
  mbtaKey = require('../resources/credentials.json').mbtaKey;
} catch (err) {
  console.warn('Missing API key, making call without key...');
}

const mbta = new MBTA(mbtaKey);
const PREDICTIONS_LIMIT = 4;

export const fetchData = async () => {
  const predictionPromises = Promise.all(
    routes.map(route =>
      mbta.fetchPredictions({
        stop: route.code,
        direction_id: route.direction,
        sort: 'arrival_time',
        include: ['stop', 'route'],
      })
    )
  );

  try {
    const predictions = await predictionPromises;
    console.log(`Fetched live data`);

    const allPreds = predictions.map((rawPred, index) => {
      const { waitStart, waitLength, route, morning } = routes[index];

      const stopDataByRoute = rawPred.data.filter(
        ea => !route || ea.relationships.route.data.id === route.toString()
      );
      const pred = { data: stopDataByRoute };
      const arrivals = mbta.selectArrivals(pred, { convertTo: 'min' });
      const stopName = mbta.selectIncluded(rawPred, 'stop')[0].attributes.name;
      const routeAttrs = mbta.selectIncluded(rawPred, 'route')[0].attributes;
      const directionIdx = rawPred.data[0].attributes.direction_id;
      const direction =
        routeAttrs.direction_destinations[directionIdx] ||
        routeAttrs.direction_names[directionIdx];

      const color = routeAttrs.color;
      const textColor = routeAttrs.text_color;
      const arrivalMins = arrivals
        .filter(min => min >= 1 && min < 60)
        .slice(0, PREDICTIONS_LIMIT);
      const _pastArrivalMins = arrivals.filter(min => min <= 2);

      const isWalkable = arrivals.some(
        mins => mins >= waitStart && mins <= waitStart + waitLength
      );

      return {
        color,
        morning,
        stopName,
        direction,
        textColor,
        isWalkable,
        arrivalMins,
        // for debugging client side
        _pastArrivalMins,
        _predictions: rawPred,
        _filtered: pred,
      };
    });

    return {
      morning: allPreds.filter(pred => pred.morning),
      evening: allPreds.filter(pred => !pred.morning),
    };

    return allPreds.reduce(
      (acc, curr) => {
        return curr.morning
          ? { morning: [...acc.morning, curr], evening: acc.evening }
          : { morning: acc.morning, evening: [...acc.evening, curr] };
      },
      { morning: [], evening: [] }
    );
    // .sort((a, b) =>
    //   new Date().getHours() < 12
    //     ? !!b.morning - !!a.morning
    //     : !!a.morning - !!b.morning
    // );
  } catch (e) {
    console.error('Error during fetch:', e);
    const { message, stack } = e;
    return { error: { message, stack } };
  }
};