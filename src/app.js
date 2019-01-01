import { h, Component } from 'preact';
import { ipcRenderer } from 'electron';
import { Title } from './components/title';
import { Arrivals } from './components/arrivals';
import { Footer } from './components/footer';
import { Fallback } from './components/fallback';

const LOADING_THRESHOLD = 150;
const GREEN = 'green';
const RED = 'red';

export default class App extends Component {
  state = {
    route: null,
    minsToArrival: [],
    error: null,
    loading: true,
    color: GREEN,
  };

  waitForLoad = null;

  componentDidMount() {
    document.body.addEventListener('click', this.handleClick);
    document.body.addEventListener('keydown', this.handleKeyDown);

    ipcRenderer.on('update', (sender, data) => {
      clearTimeout(this.waitForLoad);

      if (!data || !data.data || !data.route) {
        return this.setState({ loading: false, error: true });
      }

      const { route, minsToArrival } = data;

      const { waitStart, waitLength } = route;
      const isWalkable = mins =>
        mins >= waitStart && mins <= waitStart + waitLength;

      this.setState({
        route,
        minsToArrival,
        error: false,
        loading: false,
        color: minsToArrival.some(isWalkable) ? GREEN : RED,
      });
    });
  }

  componentWillUnmount() {
    document.body.removeEventListener('click', this.handleClick);
    document.body.removeEventListener('keydown', this.handleKeyDown);
  }

  handleClick = () => {
    ipcRenderer.send('new-route');
    this.waitForLoad = setTimeout(() => {
      this.setState({ loading: true });
    }, LOADING_THRESHOLD);
  };

  handleKeyDown = e => {
    const { key } = e;
    if (key === 'Escape') {
      ipcRenderer.send('hide-window');
    } else {
      // For now, get new route on any key.
      // Left arrow will get previous route.
      ipcRenderer.send('new-route', { key });
    }
  };

  render() {
    const { route, minsToArrival, color, error, loading } = this.state;

    // Send event to main process to change icon color
    ipcRenderer.send('change-icon', color);

    return error || loading ? (
      <Fallback color={color} error={error} />
    ) : (
      <center className={color}>
        <Title route={route} />
        <Arrivals minsToArrival={minsToArrival} route={route} />
        <Footer color={color} />
      </center>
    );
  }
}
