import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ONBOARDING_STEPS, completeOnboarding } from "@/lib/onboarding";
import { ChevronRight, ChevronLeft, X } from "lucide-react";

interface OnboardingProps {
  onComplete: () => void;
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const current = ONBOARDING_STEPS[step];
  const isLast = step === ONBOARDING_STEPS.length - 1;

  const handleComplete = () => {
    completeOnboarding();
    onComplete();
  };

  const handleSkip = () => {
    completeOnboarding();
    onComplete();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative mx-4 w-full max-w-md rounded-2xl border border-border/80 bg-card p-8 shadow-2xl"
      >
        {/* Skip button */}
        <button
          onClick={handleSkip}
          className="absolute right-4 top-4 rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Skip onboarding"
        >
          <X className="size-4" />
        </button>

        {/* Step content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={current.id}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.2 }}
            className="mb-8 text-center"
          >
            <div className="mb-4 text-4xl">{current.icon}</div>
            <h2 className="mb-2 text-xl font-bold tracking-tight">{current.title}</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {current.description}
            </p>
          </motion.div>
        </AnimatePresence>

        {/* Progress dots */}
        <div className="mb-6 flex justify-center gap-2">
          {ONBOARDING_STEPS.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setStep(i)}
              className={`size-2 rounded-full transition-all ${
                i === step
                  ? "w-6 bg-primary"
                  : i < step
                    ? "bg-primary/40"
                    : "bg-border"
              }`}
              aria-label={`Step ${i + 1}: ${s.title}`}
            />
          ))}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            disabled={step === 0}
            onClick={() => setStep((s) => s - 1)}
          >
            <ChevronLeft className="mr-1 size-4" />
            Back
          </Button>

          {isLast ? (
            <Button size="sm" onClick={handleComplete}>
              Get Started
              <ChevronRight className="ml-1 size-4" />
            </Button>
          ) : (
            <Button size="sm" onClick={() => setStep((s) => s + 1)}>
              Next
              <ChevronRight className="ml-1 size-4" />
            </Button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
