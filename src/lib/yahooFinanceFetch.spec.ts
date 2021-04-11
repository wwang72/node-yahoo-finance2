import * as util from "util";

import Queue from "./queue";
import _yahooFinanceFetch from "./yahooFinanceFetch";
import errors from "./errors";

import _env from "../env-node";
import _opts from "./options";

// https://dev.to/devcrafter91/elegant-way-to-check-if-a-promise-is-pending-577g
function isPending(promise: any) {
  return util.inspect(promise).includes("pending");
}

describe("yahooFinanceFetch", () => {
  const yahooFinanceFetch = _yahooFinanceFetch.bind({ _env, _opts });

  // Don't log errors during tests
  const fakeConsole = { log: jest.fn(), error: jest.fn(), dir: jest.fn() };
  const origConsole = console;

  // @ts-ignore
  beforeEach(() => (console = fakeConsole));
  afterEach(() => (console = origConsole));

  it("catches errors", () => {
    const url = "https://query2.finance.yahoo.com/v1/finance/search";

    return expect(
      yahooFinanceFetch(url, {}, { devel: "search-noOpts.json" })
    ).rejects.toBeInstanceOf(errors.BadRequestError);
  });

  it("throws if no environmennt set", () => {
    // @ts-ignore: we're explicityly testing for a bad runtime context
    return expect(_yahooFinanceFetch("")).rejects.toBeInstanceOf(
      errors.NoEnvironmentError
    );
  });

  if (process.env.FETCH_DEVEL !== "nocache")
    it("throws HTTPError if !res.ok and no error in json result", () => {
      return expect(
        yahooFinanceFetch(
          "https://query1.finance.yahoo.com/nonExistingURL-CACHED",
          {},
          { devel: "pageWith404andJson.fake.json" }
        )
      ).rejects.toBeInstanceOf(errors.HTTPError);
    });

  it("throws Error if we receive unknown error from json result", () => {
    return expect(
      yahooFinanceFetch(
        "https://query1.finance.yahoo.com/nonExistingURL-CACHED",
        {},
        { devel: "pageWithUnknownError.json" }
      )
    ).rejects.toBeInstanceOf(Error);
  });

  describe("concurrency", () => {
    /*
    process.on("unhandledRejection", (up) => {
      console.error("Unhandled promise rejection!");
      throw up;
    });
    */

    function immediate() {
      return new Promise((resolve) => {
        setImmediate(resolve);
      });
    }

    function makeFetch() {
      function fetch() {
        return new Promise((resolve, reject) => {
          fetch.fetches.push({
            resolve,
            reject,
            resolveWith(obj: any) {
              resolve({
                ok: true,
                async json() {
                  return obj;
                },
              });
              return immediate();
            },
          });
        });
      }
      fetch.fetches = [] as any[];
      fetch.reset = function reset() {
        // TODO check that all are resolved/rejected
        fetch.fetches = [];
      };
      return fetch;
    }

    let env: any;
    let yahooFinanceFetch: any;
    let moduleOpts: any;

    beforeEach(() => {
      env = { ..._env, fetch: makeFetch() };
      yahooFinanceFetch = _yahooFinanceFetch.bind({ _env: env, _opts });
      moduleOpts = { queue: { _queue: new Queue() } };
    });

    it("Queue takes options in constructor", () => {
      const queue = new Queue({ concurrency: 5 });
      expect(queue.concurrency).toBe(5);
    });

    it("yahooFinanceFetch branch check for alternate queue", () => {
      const promises = [
        yahooFinanceFetch("", {}),
        yahooFinanceFetch("", {}, {}),
        yahooFinanceFetch("", {}, { queue: {} }),
      ];

      env.fetch.fetches[0].resolveWith({ ok: true });
      env.fetch.fetches[1].resolveWith({ ok: true });
      env.fetch.fetches[2].resolveWith({ ok: true });

      return Promise.all(promises);
    });

    it("assert defualts to {} for empty queue opts", () => {
      moduleOpts.queue.concurrency = 1;
      const opts = { ..._opts };
      // @ts-ignore: intentional to test runtime failures
      delete opts.queue;
      const yahooFinanceFetch = _yahooFinanceFetch.bind({ _env: env, _opts });

      const promise = yahooFinanceFetch("", {}, moduleOpts);
      env.fetch.fetches[0].resolveWith({ ok: true });
      return expect(promise).resolves.toMatchObject({ ok: true });
    });

    it("single item in queue", () => {
      moduleOpts.queue.concurrency = 1;

      const promise = yahooFinanceFetch("", {}, moduleOpts);
      env.fetch.fetches[0].resolveWith({ ok: true });
      return expect(promise).resolves.toMatchObject({ ok: true });
    });

    it("waits if exceeding concurrency max", async () => {
      moduleOpts.queue.concurrency = 1;

      const promises = [
        yahooFinanceFetch("", {}, moduleOpts),
        yahooFinanceFetch("", {}, moduleOpts),
      ];

      // Second func should not be called until 1st reoslves (limit 1)
      expect(env.fetch.fetches.length).toBe(1);

      await env.fetch.fetches[0].resolveWith({ ok: true });
      expect(env.fetch.fetches.length).toBe(2);

      await env.fetch.fetches[1].resolveWith({ ok: true });
      await Promise.all(promises);
    });

    // TODO, timeout test
  });
});
