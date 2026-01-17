// src/config/tutorialSteps.ts
// Tutorial steps configuration for onboarding

import { TutorialStep } from "../components/OnboardingTutorial";

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "welcome",
    title: "Welcome to Pawsome! 👋",
    description:
      "Track your bond with your dog using real-time biometric data from wearable devices.",
    // No target - full screen welcome
  },
  {
    id: "rings",
    title: "Real-Time Bond Metrics",
    description:
      "These three rings show your Bond Score (top), Dog Health (bottom-left), and Human Health (bottom-right). They update in real-time as you and your dog bond together.",
    screen: "home",
    // Target will be measured dynamically for the rings container
  },
];

