import {
  ClipboardList,
  Heart,
  Smile,
  TrendingUp,
} from "lucide-react";

import Logo from "/assets/img/dark_theme_logo.webp";

const highlights = [
  {
    icon: ClipboardList,
    title: "Never Miss an Order",
    description:
      "Keep every customer order organized, manage daily laundry loads, and stay on top of pickups and deliveries.",
  },
  {
    icon: Smile,
    title: "Deliver a Better Customer Experience",
    description:
      "Keep customers informed about their laundry, provide timely updates, and make every order a hassle-free experience.",
  },
  {
    icon: TrendingUp,
    title: "Grow Your Laundry Business",
    description:
      "Manage your daily operations with ease, serve more customers, and keep your business running smoothly as you grow.",
  },
] as const;



export function AuthBrandPanel() {
  return (
    <>
      {/* Brand */}
      <div className="relative z-10">
        <img src={Logo} alt="logo" width={180} height={100} />
      </div>

      {/* Main Content */}
      <div className="relative z-10 my-auto max-w-md space-y-8 py-10">
        <div className="space-y-3">
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-balance">
            Your laundry business, running smoother every day.
          </h1>

          <p className="text-sm leading-relaxed text-primary-foreground/75">
            From the first customer drop-off to the final delivery,
            manage every order, track every wash, and keep your
            laundry operations running seamlessly — all in one place.
          </p>
        </div>

        {/* Key Benefits */}
        <ul className="space-y-4">
          {highlights.map(({ icon: Icon, title, description }) => (
            <li
              key={title}
              className="flex items-start gap-3"
            >
              <div
                aria-hidden="true"
                className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-foreground/10 text-primary-foreground"
              >
                <Icon className="size-4" />
              </div>

              <div className="space-y-0.5">
                <p className="text-sm font-medium text-primary-foreground">
                  {title}
                </p>

                <p className="text-xs leading-relaxed text-primary-foreground/70">
                  {description}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>


      {/* Footer */}
      <p className="relative z-10 inline-flex items-center gap-1 text-xs text-primary-foreground/60">
        © {new Date().getFullYear()} FreshFold · Made with
        <Heart
          fill="currentColor"
          strokeWidth={2}
          className="inline size-3 text-red-500"
        />
        for laundry businesses
      </p>
    </>
  );
}
