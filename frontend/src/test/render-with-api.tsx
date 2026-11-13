import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { MockApiProvider } from "../mocks/context";
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
    <MockApiProvider api={api}>
      <MemoryRouter initialEntries={[options.route ?? "/"]}>
        {ui}
      </MemoryRouter>
    </MockApiProvider>,
  );
}
