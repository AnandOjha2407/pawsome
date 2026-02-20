// src/config/tutorialSteps.ts
// Tutorial steps for DARYX Energy Intelligence – PawsomeBond Smart Harness app

import { TutorialStep } from "../components/OnboardingTutorial";

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "welcome",
    title: "Welcome to DARYX",
    description:
      "Energy Intelligence for your dog. Connect your PawsomeBond Smart Harness to see live emotional state, anxiety score, and control calming therapy from your phone.",
    screen: "home",
  },
  {
    id: "live-state",
    title: "Live Emotional State",
    description:
      "Your dog’s current state (Sleeping, Calm, Alert, Anxious, Active) and confidence % stream from the harness via WiFi. Set your Device ID in Settings to see real data.",
    screen: "home",
  },
  {
    id: "pair-harness",
    title: "Pair Your Harness",
    description:
      "Use Pair to scan for the PawsomeBond harness over Bluetooth. BLE is for first-time WiFi setup only; after that, live data comes from the cloud.",
    screen: "pairing",
  },
  {
    id: "tabs",
    title: "Dashboard, Calm & History",
    description:
      "Dashboard: live anxiety gauge and Emergency Stop. Calm: choose from 8 therapy protocols and start sessions. History: anxiety timeline and state distribution.",
    screen: "home",
  },
];

