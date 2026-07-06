import { useMutation } from '@tanstack/react-query';
import {
  submitFeatureSuggestion,
  type NewFeatureSuggestion,
} from '@/lib/queries/feature-suggestions';

/** Submit a feature suggestion. No cache to invalidate — write-only for v1. */
export function useSubmitFeatureSuggestion() {
  return useMutation({
    mutationFn: (input: NewFeatureSuggestion) => submitFeatureSuggestion(input),
  });
}
