import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { ApiProvider } from "../api/context";
import type { AppApi } from "../api/types";

export interface RenderWithApiOptions {
  route?: string;
}

export function renderWithApi(
  ui: ReactNode,
  api: AppApi,
  options: RenderWithApiOptions = {},
) {
  return render(
    <ApiProvider api={api}>
      <MemoryRouter initialEntries={[options.route ?? "/"]}>
        {ui}
      </MemoryRouter>
    </ApiProvider>,
  );
}
