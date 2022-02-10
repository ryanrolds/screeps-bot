import * as _ from "lodash"

export interface Metric {
  start: number;
  key: string;
  value: number;
  fields: TracerFields;
}

type TracerFields = Record<string, string>;
type TimerEndFunc = () => number;

export class Tracer {
  name: string;
  kv: TracerFields;

  start: number;
  children: Tracer[];

  logFilter: string;

  collect: boolean;
  collectFilter: string;
  collectMin: number;
  metrics: Metric[];

  constructor(name: string, kv: TracerFields, start: number) {
    this.name = name;
    this.kv = kv;

    this.start = 0;
    this.children = [];

    this.logFilter = null;

    this.collect = false;
    this.collectFilter = null;
    this.collectMin = 0.5;
    this.metrics = [];
  }

  as(name: string) {
    const trace = this.clone();
    trace.name = `${this.name}.${name}`;
    return trace;
  }

  withFields(fields: TracerFields): Tracer {
    let child = this.clone()
    child.kv = _.assign(child.kv, fields)
    return child;
  }

  log(message: string, details: Object = {}): void {
    if (!this.shouldLog()) {
      return;
    }

    console.log(this.name, message, JSON.stringify(details), JSON.stringify(this.kv));
  }

  notice(message: string, details: Object = {}): void {
    console.log(`<font color="#5555FF">[NOTICE]`, this.name, '::', message, JSON.stringify(details),
      JSON.stringify(this.kv), '</font>');
  }

  warn(message: string, details: Object = {}): void {
    console.log(`<font color="#ffbb00">[WARN]`, this.name, '::', message, JSON.stringify(details),
      JSON.stringify(this.kv), '</font>');
  }

  error(message: string, details: Object = {}): void {
    console.log(`<font color="#FF5555">[ERROR]`, this.name, '::', message, JSON.stringify(details),
      JSON.stringify(this.kv), '</font>');
  }

  startTimer(metric: string): TimerEndFunc {
    const start = Game.cpu.getUsed();
    return (): number => {
      const stop = Game.cpu.getUsed();
      const cpuTime = stop - start;

      if (this.shouldCollectMetrics(cpuTime)) {
        this.pushMetric(cpuTime);
      }

      if (this.shouldLog()) {
        this.writeLog(metric, cpuTime);
      }

      return cpuTime;
    }
  }

  setLogFilter(filter: string) {
    this.logFilter = filter;
  }

  setCollectMetrics(active: boolean) {
    this.collect = active;
  }

  setMetricFilter(filter: string) {
    this.collectFilter = filter;
  }

  setMetricMin(min: number) {
    this.collectMin = min;
  }

  outputMetrics() {
    _.sortBy(this.getMetrics(), 'start').forEach(metric => {
      console.log(`${metric.value.toFixed(2).padStart(5, ' ')}ms: ${metric.key} at ${metric.start}`,
        JSON.stringify(metric.fields));
    });
  }

  getMetrics(): Metric[] {
    let metrics = [].concat(this.metrics);

    this.children.forEach(child => {
      metrics = metrics.concat(child.getMetrics());
    });

    return metrics;
  }

  private clone() {
    const child = new Tracer(this.name, this.kv, this.start);
    child.kv = _.assign({}, this.kv)

    child.logFilter = this.logFilter;
    child.collect = this.collect;
    child.collectFilter = this.collectFilter;
    child.collectMin = this.collectMin;

    this.children.push(child);
    return child;
  }

  private shouldCollectMetrics(cpuTime: number): boolean {
    return this.collect && (!this.collectFilter || this.name.startsWith(this.collectFilter)) &&
      (!this.collectMin || (this.collectMin > 0 && this.collectMin < cpuTime));
  }

  private shouldLog(): boolean {
    return this.logFilter === this.kv['pid'];
  }

  private pushMetric(cpuTime: number) {
    const item = {start: this.start, key: this.name, value: cpuTime, fields: this.kv}
    this.metrics.push(item);
  }

  private writeLog(metric: string, cpuTime: number) {
    console.log(`${cpuTime.toFixed(2).padStart(5, ' ')}ms: ${this.name} ${metric || ''} at ${this.start}`,
      JSON.stringify(this.kv));
  }

  /**
   * @deprecated The method is being replaced with startTimer
   */
  begin(name: string) {
    const trace = this.clone().as(name);
    trace.start = Game.cpu.getUsed();
    return trace;
  }

  /**
   * @deprecated  The method is being replaced with startTimer
   */
  end(): number {
    // If tracing not active minimize the overhead of the tracer
    if (!this.start) {
      return 0
    }

    const stop = Game.cpu.getUsed();
    const cpuTime = stop - this.start;

    if (this.shouldCollectMetrics(cpuTime)) {
      this.pushMetric(cpuTime);
    }

    if (this.shouldLog()) {
      this.writeLog(null, cpuTime);
    }

    return cpuTime;
  }
}
