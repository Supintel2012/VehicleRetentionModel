/**
 * Example prompts for a policy analyst on the "Use it in Claude" tab. Each
 * names the model and the inputs it needs, and each must be answerable by the
 * engine the connector runs today: the fleet-weighted prompt is offered only
 * when the run that answered this page carried the RR Toolbox cohort output.
 */

export interface ExamplePrompt {
  title: string;
  prompt: string;
}

const PRICE_COMPARISON: ExamplePrompt = {
  title: "Baseline against a $1,000 higher new-vehicle price",
  prompt:
    "Using the Rapid Recursive Toolbox, run the AutoDriveOrSell model at its defaults and again with the new-vehicle price " +
    "(PriceNewCar) raised from $43,000 to $44,000. For each economic-index level, compare the youngest vehicle age at which " +
    "selling is optimal, list every state whose best action changes, and say plainly how many of the 880 states that is.",
};

const FLEET_WEIGHTED: ExamplePrompt = {
  title: "Replacement share by vehicle age, fleet-weighted",
  prompt:
    "Using the Rapid Recursive Toolbox, run AutoDriveOrSell with cohorts set to true and price_shock set to 1000. For each vehicle " +
    "age, show the fleet-weighted replacement share (replacement_hazard) next to the equal-weight share of grid states that sell " +
    "(grid_share_sell), and explain why they differ. Then report the annual replacement rate, the average holding period and the " +
    "implied elasticities for the $1,000 price change, with the caveats the model returns.",
};

const EQUAL_WEIGHT: ExamplePrompt = {
  title: "Grid states that sell, by vehicle age",
  prompt:
    "Using the Rapid Recursive Toolbox, run AutoDriveOrSell at its defaults. For each vehicle age, report how many of the grid " +
    "states at that age have selling (trade in and buy new) as the best action, and the share that is. Say plainly that every " +
    "state counts equally, so these are shares of grid states, not of vehicles, and name the youngest age at which any state sells.",
};

const CUSTOM_PROFILE: ExamplePrompt = {
  title: "A custom owner profile",
  prompt:
    "Using the Rapid Recursive Toolbox, run AutoDriveOrSell for an owner who drives 20,000 miles a year (12,000 when cutting back), " +
    "pays $3,000 a year for insurance and property tax, faces a $48,000 new-vehicle price and discounts the future at 7% a year. " +
    "At what age does this owner replace a 28 mpg vehicle at each economic-index level, and how does that compare with the " +
    "model's defaults?",
};

/** The three prompts to show; `hasCohorts` is whether the run answering this page carried the cohort output (null before any answer). */
export function examplePrompts(hasCohorts: boolean | null): ExamplePrompt[] {
  return [PRICE_COMPARISON, hasCohorts === true ? FLEET_WEIGHTED : EQUAL_WEIGHT, CUSTOM_PROFILE];
}
