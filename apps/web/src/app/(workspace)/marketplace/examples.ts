import {
  RiBankCardLine,
  RiGitBranchLine,
  RiShieldCheckLine,
  RiUserFollowLine,
} from "@remixicon/react";

export const flowExamples = [
  {
    id: "ticket-checkout",
    steps: [
      { name: "Select a ticket", description: "Choose a ticket and quantity." },
      { name: "Verify the visitor", description: "Complete a World Selfie Check before checkout." },
      {
        name: "Collect payment",
        description: "Use a Privy wallet to pay for the selected tickets.",
      },
      { name: "Issue the ticket", description: "Show the ticket after payment is confirmed." },
    ],
    name: "Ticket checkout",
    description: "Verify a visitor, collect payment and issue a ticket.",
    nodes: [
      { name: "World · Selfie Check", logo: "world" },
      { name: "Privy · Wallet", logo: "privy" },
    ],
  },
  {
    id: "payment-link",
    steps: [
      { name: "Open the payment app", description: "Display the amount and payment details." },
      { name: "Connect a wallet", description: "Let the payer connect through Privy." },
      { name: "Collect USDC", description: "Request the payment and show its confirmation." },
    ],
    name: "Payment link",
    description: "Accept USDC payments through a shareable app.",
    nodes: [
      { name: "Privy · Wallet", logo: "privy" },
      { name: "USDC payment", icon: RiBankCardLine },
    ],
  },
  {
    id: "verification-gate",
    steps: [
      { name: "Verify the visitor", description: "Complete a World Selfie Check." },
      { name: "Check the result", description: "Continue only when verification succeeds." },
      { name: "Grant access", description: "Open the next step for the verified visitor." },
    ],
    name: "Verification gate",
    description: "Verify visitors before giving them access.",
    nodes: [
      { name: "World · Selfie Check", logo: "world" },
      { name: "Access check", icon: RiShieldCheckLine },
    ],
  },
  {
    id: "approval-flow",
    steps: [
      { name: "Submit a request", description: "Collect the information a reviewer needs." },
      { name: "Wait for a decision", description: "Let a reviewer approve or reject the request." },
      {
        name: "Choose the next step",
        description: "Continue when approved, or stop when rejected.",
      },
    ],
    name: "Approval flow",
    description: "Review a request before allowing the next step.",
    nodes: [
      { name: "Human approval", icon: RiUserFollowLine },
      { name: "Condition", icon: RiGitBranchLine },
    ],
  },
] as const;
