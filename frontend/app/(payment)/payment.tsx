import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
} from "react-native";
import React, { useState, useEffect } from "react";
import RazorpayCheckout from "react-native-razorpay";
import { supabase } from "../../lib/supabase";
import { User } from "@supabase/supabase-js";
import { router } from "expo-router";

// Replace with your actual backend URL
const BACKEND_URL =
  process.env.EXPO_PUBLIC_SERVER_URL || "http://localhost:8000";
const RAZOR_KEY = process.env.EXPO_PUBLIC_RAZORPAY_ID;
interface Plan {
  id: string;
  name: string;
  monthly_price: number;
  monthly_limit: number;
  created_at: string;
}

interface PaymentStatus {
  session_limit: number;
  session_used: number;
  remaining: number;
  status: string;
  next_billing_at: string | null;
}

interface UserProfile {
  id: string;
  name: string;
  email: string;
  age?: number;
  created_at: string;
  updated_at: string;
}

const RazorpayPaymentScreen = () => {
  const [loading, setLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | null>(
    null
  );
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      setIsLoading(true);

      // Get current user session - same as profile.tsx
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        console.error("Session error:", sessionError);
        router.navigate("/(auth)/login");
        return;
      }

      if (!session?.user) {
        console.log("No user session found");
        router.navigate("/(auth)/login");
        return;
      }

      setUser(session.user);

      // Fetch user profile from database - same as profile.tsx
      await fetchUserProfile(session.user.id);

      // Fetch payment-specific data
      await fetchPlans(session.access_token);
      await fetchPaymentStatus(session.access_token);
    } catch (error) {
      console.error("Error loading user data:", error);
      Alert.alert("Error", "Failed to load user data");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUserProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", userId)
        .single();

      if (error && error.code !== "PGRST116") {
        console.error("Error fetching user profile:", error);
        return;
      }

      if (data) {
        setUserProfile(data);
      }
    } catch (error) {
      console.error("Error fetching user profile:", error);
    }
  };

  // Fetch available plans
  const fetchPlans = async (accessToken: string) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/plans`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch plans");
      }

      const plansData = await response.json();
      setPlans(plansData);

      // Select first plan by default
      if (plansData.length > 0) {
        setSelectedPlan(plansData[0]);
      }
    } catch (error) {
      console.error("Error fetching plans:", error);
      Alert.alert("Error", "Failed to load plans");
    }
  };

  // Fetch current payment status
  const fetchPaymentStatus = async (accessToken: string) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/payments/usage`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const statusData = await response.json();
        setPaymentStatus(statusData);
      }
    } catch (error) {
      console.error("Error fetching payment status:", error);
    }
  };

  // Refresh function - similar to profile.tsx
  const onRefresh = async () => {
    setRefreshing(true);
    await loadUserData();
    setRefreshing(false);
  };

  // Create subscription
  const createSubscription = async (
    planId: string,
    email: string,
    name?: string
  ) => {
    try {
      // Get fresh session token
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("No valid session");
      }

      const response = await fetch(
        `${BACKEND_URL}/api/payments/create-subscription`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            plan_id: planId,
            customer_email: email,
            customer_name: name,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to create subscription");
      }

      return await response.json();
    } catch (error) {
      console.error("Error creating subscription:", error);
      throw error;
    }
  };

  // Handle payment process
  const handlePayment = async () => {
    if (!selectedPlan) {
      Alert.alert("Error", "Please select a plan");
      return;
    }

    if (!user) {
      Alert.alert("Error", "Authentication required");
      return;
    }

    // Use userProfile for name, fallback to user metadata, then user email
    const userName =
      userProfile?.name ||
      user?.user_metadata?.full_name ||
      user?.email?.split("@")[0] ||
      "User";

    const userEmail = userProfile?.email || user?.email;

    if (!userEmail) {
      Alert.alert("Error", "User email is required");
      return;
    }

    setLoading(true);

    try {
      // Create subscription on backend
      const subscriptionData = await createSubscription(
        selectedPlan.id,
        userEmail,
        userName
      );

      // Open Razorpay checkout
   const options = {
     description: `Subscription: ${selectedPlan.name}`,
     image: "https://i.imgur.com/3g7nmJC.png",
     currency: "INR",

     amount: selectedPlan.monthly_price * 100,
     name: "Your App Name",
     key: RAZOR_KEY, 
     subscription_id: subscriptionData.subscription_id,

     prefill: {
       email: userEmail,
       contact: "=919548999129",
       name: userName,
     },
     theme: {
       color: "#3399cc",
     },

     config: {
       display: {
         blocks: {
           other: {
             name: "Choose a Payment Method",
             instruments: [
               { method: "upi" },
               { method: "card" },
               { method: "wallet" },
               { method: "netbanking" },
             ],
           },
         },
         sequence: ["block.other"],
         preferences: {
           show_default_blocks: true,
         },
       },
     },
     modal: {
       ondismiss: () => {
         console.log("Payment modal dismissed");
         Alert.alert("Payment Cancelled", "You have cancelled the payment.");
       },
     },
   };

      RazorpayCheckout.open(options)
        .then((data) => {
          setLoading(false);
          Alert.alert(
            "Payment Successful",
            `Subscription activated!\nPayment ID: ${data.razorpay_payment_id}`,
            [
              {
                text: "OK",
                onPress: async () => {
                  // Refresh payment status
                  const {
                    data: { session },
                  } = await supabase.auth.getSession();
                  if (session?.access_token) {
                    await fetchPaymentStatus(session.access_token);
                  }
                },
              },
            ]
          );
        })
        .catch((error) => {
          setLoading(false);
          console.log("Payment Error:", error);

          if (error.code === RazorpayCheckout.PAYMENT_CANCELLED) {
            Alert.alert("Payment Cancelled", "Payment was cancelled by user");
          } else {
            Alert.alert("Payment Failed", `Error: ${error.description}`);
          }
        });
    } catch (error) {
      setLoading(false);
      Alert.alert("Error", "Could not initiate payment. Please try again.");
    }
  };

  // Cancel subscription
  const cancelSubscription = async () => {
    try {
      setLoading(true);

      // Get fresh session token
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("No valid session");
      }

      const response = await fetch(
        `${BACKEND_URL}/api/payments/cancel-subscription`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to cancel subscription");
      }

      setLoading(false);
      Alert.alert("Success", "Subscription cancelled successfully", [
        {
          text: "OK",
          onPress: async () => {
            // Refresh payment status
            await fetchPaymentStatus(session.access_token);
          },
        },
      ]);
    } catch (error) {
      setLoading(false);
      console.error("Error cancelling subscription:", error);
      Alert.alert("Error", "Failed to cancel subscription");
    }
  };

  const formatPrice = (price: number) => {
    return `₹${(price / 100).toFixed(2)}`;
  };

  const getUserDisplayName = () => {
    if (userProfile?.name) {
      return userProfile.name;
    }
    if (user?.user_metadata?.full_name) {
      return user.user_metadata.full_name;
    }
    if (user?.email) {
      return user.email.split("@")[0];
    }
    return "User";
  };

  // Loading state - similar to profile.tsx
  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color="#3399cc" />
        <Text style={styles.loadingText}>Loading subscription plans...</Text>
      </SafeAreaView>
    );
  }

  // Error state - similar to profile.tsx
  if (!user) {
    return (
      <SafeAreaView style={[styles.container, styles.loadingContainer]}>
        <Text style={styles.errorText}>Unable to load user data</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadUserData}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <Text style={styles.title}>Subscription Plans</Text>
        <Text style={styles.welcomeText}>Welcome, {getUserDisplayName()}!</Text>

        {/* Current Payment Status */}
        {paymentStatus && paymentStatus.status !== "no_plan" && (
          <View style={styles.statusCard}>
            <Text style={styles.statusTitle}>Current Plan Status</Text>
            <Text style={styles.statusText}>
              Sessions Used: {paymentStatus.session_used} /{" "}
              {paymentStatus.session_limit}
            </Text>
            <Text style={styles.statusText}>
              Remaining: {paymentStatus.remaining}
            </Text>
            <Text style={styles.statusText}>
              Status: {paymentStatus.status}
            </Text>
            {paymentStatus.next_billing_at && (
              <Text style={styles.statusText}>
                Next Billing:{" "}
                {new Date(paymentStatus.next_billing_at).toLocaleDateString()}
              </Text>
            )}

            {paymentStatus.status === "active" && (
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={cancelSubscription}
                disabled={loading}
              >
                <Text style={styles.cancelButtonText}>Cancel Subscription</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Plan Selection */}
        <Text style={styles.sectionTitle}>Choose a Plan</Text>
        {plans.map((plan) => (
          <TouchableOpacity
            key={plan.id}
            style={[
              styles.planCard,
              selectedPlan?.id === plan.id && styles.selectedPlanCard,
            ]}
            onPress={() => setSelectedPlan(plan)}
          >
            <View style={styles.planHeader}>
              <Text style={styles.planName}>{plan.name}</Text>
              <Text style={styles.planPrice}>
                {formatPrice(plan.monthly_price)}/month
              </Text>
            </View>
            <Text style={styles.planLimit}>
              {plan.monthly_limit} sessions per month
            </Text>
          </TouchableOpacity>
        ))}

        {/* Payment Button */}
        {selectedPlan && (
          <View style={styles.paymentCard}>
            <Text style={styles.selectedPlanText}>
              Selected: {selectedPlan.name}
            </Text>
            <Text style={styles.amount}>
              {formatPrice(selectedPlan.monthly_price)}
            </Text>
            <Text style={styles.description}>
              Monthly Subscription - {selectedPlan.monthly_limit} sessions
            </Text>

            <TouchableOpacity
              style={[styles.payButton, loading && styles.payButtonDisabled]}
              onPress={handlePayment}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.payButtonText}>Subscribe Now</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.note}>
          Note: This is using Razorpay test mode. Replace with live keys for
          production.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};

export default RazorpayPaymentScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#666",
  },
  errorText: {
    fontSize: 16,
    color: "#ff4444",
    textAlign: "center",
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: "#3399cc",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
    marginTop: 20,
    marginBottom: 10,
    color: "#333",
  },
  welcomeText: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 20,
    color: "#666",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 15,
    marginHorizontal: 20,
    color: "#333",
  },
  statusCard: {
    backgroundColor: "white",
    padding: 20,
    borderRadius: 10,
    marginHorizontal: 20,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#3399cc",
  },
  statusText: {
    fontSize: 14,
    color: "#666",
    marginBottom: 5,
  },
  cancelButton: {
    backgroundColor: "#ff4444",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 10,
    alignSelf: "flex-start",
  },
  cancelButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "bold",
  },
  planCard: {
    backgroundColor: "white",
    padding: 20,
    borderRadius: 10,
    marginHorizontal: 20,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: "transparent",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  selectedPlanCard: {
    borderColor: "#3399cc",
    backgroundColor: "#f0f8ff",
  },
  planHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 5,
  },
  planName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  planPrice: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#3399cc",
  },
  planLimit: {
    fontSize: 14,
    color: "#666",
  },
  paymentCard: {
    backgroundColor: "white",
    padding: 30,
    borderRadius: 10,
    alignItems: "center",
    marginHorizontal: 20,
    marginTop: 20,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  selectedPlanText: {
    fontSize: 16,
    color: "#666",
    marginBottom: 10,
  },
  amount: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#3399cc",
    marginBottom: 10,
  },
  description: {
    fontSize: 16,
    color: "#666",
    marginBottom: 30,
    textAlign: "center",
  },
  payButton: {
    backgroundColor: "#3399cc",
    paddingHorizontal: 40,
    paddingVertical: 15,
    borderRadius: 25,
    minWidth: 150,
  },
  payButtonDisabled: {
    backgroundColor: "#ccc",
  },
  payButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
  },
  note: {
    fontSize: 12,
    color: "#666",
    textAlign: "center",
    marginTop: 20,
    marginHorizontal: 20,
    fontStyle: "italic",
    paddingBottom: 20,
  },
});
