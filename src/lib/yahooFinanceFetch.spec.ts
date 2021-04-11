import _yahooFinanceFetch from "./yahooFinanceFetch";
import errors from "./errors";

import _env from "../env-node";
import _opts from "./options";

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
    process.on("unhandledRejection", (up) => {
      throw up;
    });
    function makeFetch() {
      function fetch() {
        return new Promise((resolve, reject) => {
          fetch.fetches.push({ resolve, reject });
        });
      }
      fetch.fetches = [] as any[];
      fetch.finish = function reset() {
        // TODO check that all are resolved/rejected
        fetch.fetches = [];
      };
      return fetch;
    }

    const env = { ..._env, fetch: makeFetch() };
    const yahooFinanceFetch = _yahooFinanceFetch.bind({ _env: env, _opts });

    it("single item in queue", () => {
      const p1 = yahooFinanceFetch("");
      p1; //?
      env.fetch.fetches; //?
      //expect(p1).resolves.toBe("OK");
    });
  });
});
