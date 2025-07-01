import { StyleSheet, Text, View } from 'react-native'
import React from 'react'
import { useRouter } from 'expo-router'
import { Button } from '@react-navigation/elements'
import { registerGlobals } from "@livekit/react-native";

registerGlobals();

const index = () => {

    const router = useRouter()
  return (
    <View>
      <Text>index</Text>
      <Button onPress={()=>router.navigate("/call")}>call</Button>
      
    </View>
  )
}

export default index

const styles = StyleSheet.create({})