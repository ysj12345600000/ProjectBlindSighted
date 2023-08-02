import React, { useState, useEffect, createContext, useContext, SetStateAction, Dispatch } from 'react';

import { FlatList, Button, View, Text, StyleSheet, Alert, NativeModules  } from 'react-native';
import { useBleManager, BleManagerContextProvider } from './components/BleOperation1';
import {triangulationCalculater, DsitanceCalculateParams} from './components/triangulationCalculater';
import { Device } from 'react-native-ble-plx';


interface DeviceInfoDisp {
  device :Device;
  // 在这里添加更多的设备属性
}

const ContextApp = () => {
  const { 
    isAllowRssiScan,
    isSearchBle,
    connectedDevicesInfo,
    setIsAllowRssiScan,
    setIsSearchBle,
    rssiLists,
    } = useBleManager();
  const [ calculateForDistance, setCalculateForDistance ] = useState(false); //估计距离
  const { calculateDistances, getUsersPosition, angleDifference } = triangulationCalculater();
  const [ userPosition, setUserPosition ] = useState([0,0]);

  
 useEffect(()=>{
    



  //渲染扫描的设备列表
  const renderDeviceInfoDisp= ( {item}: {item: DeviceInfoDisp}) => {

    let displayName = item.device.name;
    if (!displayName) {
      displayName = 'Unknown Device';
    }

    return (
      <View style={[styles.itemContainer, {alignItems: 'center'}]}>
      <View style={{flexDirection: 'column', alignItems: 'center'}}>

        <Text style={styles.itemText}>设备名称: {displayName}</Text>

        <Text style={styles.itemText}>设备ID: {item.device.id}</Text>

      
      </View>
    </View>
      );
  };


  return (
    <View style={styles.container}>
      <Button title="Scan Devices" color={isSearchBle? 'red': 'blue'}onPress={()=>{isSearchBle? setIsSearchBle(false):setIsSearchBle(true)}} />
      <Button title="获取RSSI值" color='green' onPress={()=>{setIsAllowRssiScan(true)}} />
      {calculateForDistance? <Button title="停止计算位置" color='red' onPress={()=>{setCalculateForDistance(false)}} />: <Button title="计算位置" color='pink' onPress={()=>{setCalculateForDistance(true)}} />}
      {/* <Button title="获取角度" color='orange' onPress={()=>setAllowNotifyOrientation(!allowNotifyOrientation)} /> */}
      
      <FlatList
        data={connectedDevicesInfo}
        renderItem={renderDeviceInfoDisp}
        keyExtractor={(item, index) => index.toString()}
      />
    </View>
  );

};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemContainer: {
    backgroundColor: '#fff',
    padding: 20,
    marginVertical: 8,
    marginHorizontal: 16,
    borderRadius: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1,
    elevation: 2,
  },
  itemText: {
    fontSize: 16,
    color: '#000', // 添加这行，确保文字颜色为黑色
  },
});

const App = () => {
  return (
    <BleManagerContextProvider>
      <ContextApp />
    </BleManagerContextProvider>
  );
}

export default App;